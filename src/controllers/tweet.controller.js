import mongoose, {isValidObjectId} from "mongoose";
import Tweet from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import asyncHandler from "../utils/asyncHandler";
import { ApiError }from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const createTweet = asyncHandler(async (req, res) => {
  const { content, parentTweet } = req.body;

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  if (!content || !content.trim()) {
    throw new ApiError(400, "Tweet content is required");
  }

  const tweet = await Tweet.create({
    content: content.trim(),
    owner: req.user._id,
    parentTweet: parentTweet || null,
  });

  const populatedTweet = await Tweet.findById(tweet._id)
    .populate("owner", "username avatar")
    .lean();

  res.status(201).json(
    new ApiResponse(201, populatedTweet, "Tweet created successfully")
  );
});

const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Validate userId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  let { page = 1, limit = 10, includeReplies = "false" } = req.query;

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);
  const skip = (pageNum - 1) * limitNum;

  // Convert query param to boolean
  const showReplies = includeReplies === "true";

  // Aggregation pipeline
  const pipeline = [
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        ...(showReplies ? {} : { parentTweet: null }), // hide replies by default
      },
    },

    // Sort latest first
    {
      $sort: { createdAt: -1 },
    },

    // Pagination
    {
      $facet: {
        tweets: [
          { $skip: skip },
          { $limit: limitNum },

          // Join owner
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
            },
          },
          { $unwind: "$owner" },

          // Shape response
          {
            $project: {
              _id: 1,
              content: 1,
              media: 1,
              likesCount: 1,
              repliesCount: 1,
              parentTweet: 1,
              createdAt: 1,
              owner: {
                _id: "$owner._id",
                username: "$owner.username",
                avatar: "$owner.avatar",
              },
            },
          },
        ],

        totalCount: [{ $count: "count" }],
      },
    },

    // Final reshape
    {
      $project: {
        tweets: 1,
        total: { $arrayElemAt: ["$totalCount.count", 0] },
      },
    },
  ];

  const result = await Tweet.aggregate(pipeline);

  const tweets = result[0]?.tweets || [];
  const total = result[0]?.total || 0;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        tweets,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "User tweets fetched successfully"
    )
  );
});

const updateTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  if (content === undefined) {
    throw new ApiError(400, "Nothing to update");
  }

  // STEP 1: Get tweet (for time limit + ownership)
  const existingTweet = await Tweet.findById(tweetId);

  if (!existingTweet || existingTweet.isDeleted) {
    throw new ApiError(404, "Tweet not found");
  }

  if (!existingTweet.owner.equals(req.user._id)) {
    throw new ApiError(403, "Not allowed");
  }

  // STEP 2: Time limit (15 min)
  const EDIT_LIMIT = 15 * 60 * 1000;

  if (Date.now() - existingTweet.createdAt.getTime() > EDIT_LIMIT) {
    throw new ApiError(403, "Editing time expired (15 minutes)");
  }

  // STEP 3: Profanity filter
  const cleanContent = (text) => {
    return text.replace(/badword/gi, "***");
  };

  const trimmed = cleanContent(content.trim());

  if (!trimmed) {
    throw new ApiError(400, "Tweet content cannot be empty");
  }

  if (trimmed.length > 280) {
    throw new ApiError(400, "Tweet cannot exceed 280 characters");
  }

  // STEP 4: Update
  const tweet = await Tweet.findOneAndUpdate(
    {
      _id: tweetId,
      owner: req.user._id,
      isDeleted: false,
    },
    {
      $set: {
        content: trimmed,
        editedAt: new Date(), // edit history
      },
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate("owner", "username avatar")
    .lean();

  res.status(200).json(
    new ApiResponse(200, tweet, "Tweet updated successfully")
  );
});

const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID");
  }

  // Auth
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  // Fetch once (needed for repliesCount handling)
  const tweet = await Tweet.findById(tweetId);

  if (!tweet || tweet.isDeleted) {
    throw new ApiError(404, "Tweet not found");
  }

  // Ownership
  if (!tweet.owner.equals(req.user._id)) {
    throw new ApiError(403, "You are not allowed to delete this tweet");
  }

  // If it's a reply → decrement parent's repliesCount
  if (tweet.parentTweet) {
    await Tweet.findByIdAndUpdate(
      tweet.parentTweet,
      { $inc: { repliesCount: -1 } },
      { new: false }
    );
  }

  // Soft delete (atomic with ownership + not already deleted)
  const deleted = await Tweet.findOneAndUpdate(
    {
      _id: tweetId,
      owner: req.user._id,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!deleted) {
    throw new ApiError(
      404,
      "Tweet not found or already deleted or not authorized"
    );
  }

  res.status(200).json(
    new ApiResponse(200, null, "Tweet deleted successfully")
  );
});

const restoreTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const tweet = await Tweet.findOneAndUpdate(
    {
      _id: tweetId,
      owner: req.user._id,
      isDeleted: true,
    },
    {
      $set: {
        isDeleted: false,
        deletedAt: null,
      },
    },
    { new: true }
  );

  if (!tweet) {
    throw new ApiError(404, "Tweet not found in trash");
  }

  // If it's a reply → increment parent's repliesCount back
  if (tweet.parentTweet) {
    await Tweet.findByIdAndUpdate(
      tweet.parentTweet,
      { $inc: { repliesCount: 1 } },
      { new: false }
    );
  }

  res.status(200).json(
    new ApiResponse(200, tweet, "Tweet restored successfully")
  );
});

const permanentlyDeleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const deleted = await Tweet.findOneAndDelete({
    _id: tweetId,
    owner: req.user._id,
    isDeleted: true, // only from trash
  });

  if (!deleted) {
    throw new ApiError(404, "Tweet not found in trash");
  }

  res.status(200).json(
    new ApiResponse(200, null, "Tweet permanently deleted")
  );
});

export {
  createTweet,
  getUserTweets,
  updateTweet,
  deleteTweet,
  restoreTweet,
  permanentlyDeleteTweet
}