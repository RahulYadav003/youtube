import mongoose, { isValidObjectId } from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { Like } from "../models/like.js";
import { Video } from "../models/video.js";
import { Comment } from "../models/comment.js";
import { Tweet } from "../models/tweet.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  // Validate videoId
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const userId = req.user._id;

  // Check if already liked
  const existingLike = await Like.findOne({
    video: videoId,
    user: userId,
  });

  let isLiked;

  if (existingLike) {
    // Unlike
    await existingLike.deleteOne();
    isLiked = false;
  } else {
    // Like
    await Like.create({
      video: videoId,
      user: userId,
    });
    isLiked = true;
  }

  // Optional: count total likes
  const totalLikes = await Like.countDocuments({ video: videoId });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        isLiked,
        totalLikes,
      },
      isLiked ? "Video liked" : "Video unliked"
    )
  );
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  // Validate commentId
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }

  // Ensure user exists
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = req.user._id;

  // Check if comment exists
  const commentExists = await Comment.findById(commentId);
  if (!commentExists) {
    throw new ApiError(404, "Comment not found");
  }

  // Check if already liked
  const existingLike = await Like.findOne({
    comment: commentId,
    user: userId,
  });

  let isLiked;

  if (existingLike) {
    // Unlike
    await existingLike.deleteOne();
    isLiked = false;
  } else {
    // Like
    await Like.create({
      comment: commentId,
      user: userId,
    });
    isLiked = true;
  }

  // Count total likes
  const totalLikes = await Like.countDocuments({ comment: commentId });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        isLiked,
        totalLikes,
      },
      isLiked ? "Comment liked" : "Comment unliked"
    )
  );
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  // Validate tweetId
  if (!mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID");
  }

  // Ensure user is authenticated
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = req.user._id;

  // Check if tweet exists
  const tweet = await Tweet.findById(tweetId);
  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }

  // Try to delete existing like (optimized toggle)
  const deleted = await Like.findOneAndDelete({
    tweet: tweetId,
    user: userId,
  });

  let isLiked;

  if (deleted) {
    // Like was removed
    isLiked = false;
  } else {
    // Create new like
    await Like.create({
      tweet: tweetId,
      user: userId,
    });
    isLiked = true;
  }

  // Count total likes
  const totalLikes = await Like.countDocuments({ tweet: tweetId });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        isLiked,
        totalLikes,
      },
      isLiked ? "Tweet liked" : "Tweet unliked"
    )
  );
});

const getLikedVideos = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = req.user._id;
  let { page = 1, limit = 10 } = req.query;

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);

  const pipeline = [
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        video: { $ne: null },
      },
    },

    // Join videos
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "video",
      },
    },
    { $unwind: "$video" },

    // Join owner (user)
    {
      $lookup: {
        from: "users",
        localField: "video.owner",
        foreignField: "_id",
        as: "video.owner",
      },
    },
    { $unwind: "$video.owner" },

    // Shape response
    {
      $project: {
        _id: 0,
        video: {
          _id: "$video._id",
          title: "$video.title",
          thumbnail: "$video.thumbnail",
          createdAt: "$video.createdAt",
          owner: {
            _id: "$video.owner._id",
            username: "$video.owner.username",
            avatar: "$video.owner.avatar",
          },
        },
        likedAt: "$createdAt",
      },
    },

    { $sort: { likedAt: -1 } },
    { $skip: (pageNum - 1) * limitNum },
    { $limit: limitNum },
  ];

  const videos = await Like.aggregate(pipeline);

  // Total count
  const total = await Like.countDocuments({
    user: userId,
    video: { $ne: null },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Liked videos fetched successfully"
    )
  );
});

export {
  toggleVideoLike,
  toggleCommentLike,
  toggleTweetLike,
  getLikedVideos
};