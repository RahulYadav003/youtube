import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { Subscription } from "../models/subscription.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { Like } from "../models/like.js";
import { Video } from "../models/video.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = req.user._id;

  if (userId.toString() === channelId) {
    throw new ApiError(400, "You cannot subscribe to yourself");
  }

  let isSubscribed;

  try {
    const existing = await Subscription.findOne({
      subscriber: userId,
      channel: channelId,
    });

    if (existing) {
      if (existing.isSubscribed) {
        existing.isSubscribed = false;
        existing.unsubscribedAt = new Date();
        await existing.save();
        isSubscribed = false;
      } else {
        existing.isSubscribed = true;
        existing.unsubscribedAt = null;
        await existing.save();
        isSubscribed = true;
      }
    } else {
      await Subscription.create({
        subscriber: userId,
        channel: channelId,
      });
      isSubscribed = true;
    }
  } catch (error) {
    // Handle duplicate key error safely
    if (error.code === 11000) {
      isSubscribed = true;
    } else {
      throw error;
    }
  }

  const subscribersCount = await Subscription.countDocuments({
    channel: channelId,
    isSubscribed: true,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      { isSubscribed, subscribersCount },
      isSubscribed ? "Subscribed successfully" : "Unsubscribed successfully"
    )
  );
});

const getUserSubscriptions = asyncHandler(async (req, res) => {
  // Auth check
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = req.user._id;

  let { page = 1, limit = 10 } = req.query;

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);

  // Fetch subscriptions (who user follows)
  const subscriptions = await Subscription.find({
    subscriber: userId,
    isSubscribed: true,
  })
    .populate("channel", "username avatar")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Total count
  const total = await Subscription.countDocuments({
    subscriber: userId,
    isSubscribed: true,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        subscriptions,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "User subscriptions fetched successfully"
    )
  );
});

const getChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }

  let { page = 1, limit = 10 } = req.query;

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);

  const subscribers = await Subscription.find({
    channel: channelId,
    isSubscribed: true,
  })
    .populate("subscriber", "username avatar")
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const total = await Subscription.countDocuments({
    channel: channelId,
    isSubscribed: true,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        subscribers,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Subscribers fetched"
    )
  );
});

const getChannelProfile = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }

  // Check channel exists
  const channel = await User.findById(channelId)
    .select("username avatar bio createdAt")
    .lean();

  if (!channel) {
    throw new ApiError(404, "Channel not found");
  }

  const userId = req.user?._id;

  // Aggregation (efficient counts)
  const [subscribersCount, subscriptionsCount, isSubscribed] =
    await Promise.all([
      // Subscribers (followers)
      Subscription.countDocuments({
        channel: channelId,
        isSubscribed: true,
      }),

      // Subscriptions (following)
      Subscription.countDocuments({
        subscriber: channelId,
        isSubscribed: true,
      }),

      // Is current user subscribed?
      userId
        ? Subscription.exists({
            subscriber: userId,
            channel: channelId,
            isSubscribed: true,
          })
        : false,
    ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...channel,
        subscribersCount,
        subscriptionsCount,
        isSubscribed: !!isSubscribed,
      },
      "Channel profile fetched successfully"
    )
  );
});

const getChannelVideos = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }

  const channel = await User.findById(channelId).select("_id").lean();

  if (!channel) {
    throw new ApiError(404, "Channel not found");
  }

  let { page = 1, limit = 10, sort = "latest", search = "" } = req.query;

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);
  const skip = (pageNum - 1) * limitNum;

  const userId = req.user?._id
    ? new mongoose.Types.ObjectId(req.user._id)
    : null;

  // Sorting logic
  let sortStage = { createdAt: -1 }; // default latest

  if (sort === "popular") {
    sortStage = { views: -1 };
  } else if (sort === "oldest") {
    sortStage = { createdAt: 1 };
  }

  // Match stage (with search)
  const matchStage = {
    owner: new mongoose.Types.ObjectId(channelId),
    isPublished: true,
  };

  if (search) {
    matchStage.title = { $regex: search, $options: "i" };
  }

  const pipeline = [
    { $match: matchStage },

    { $sort: sortStage },

    {
      $facet: {
        videos: [
          { $skip: skip },
          { $limit: limitNum },

          // Owner lookup
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
            },
          },
          { $unwind: "$owner" },

          // Likes lookup (isLiked)
          ...(userId
            ? [
                {
                  $lookup: {
                    from: "likes",
                    let: { videoId: "$_id" },
                    pipeline: [
                      {
                        $match: {
                          $expr: {
                            $and: [
                              { $eq: ["$video", "$$videoId"] },
                              { $eq: ["$likedBy", userId] },
                            ],
                          },
                        },
                      },
                    ],
                    as: "likedData",
                  },
                },
                {
                  $addFields: {
                    isLiked: { $gt: [{ $size: "$likedData" }, 0] },
                  },
                },
              ]
            : [
                {
                  $addFields: { isLiked: false },
                },
              ]),

          // Final response shape
          {
            $project: {
              _id: 1,
              title: 1,
              thumbnail: 1,
              duration: 1,
              views: 1,
              createdAt: 1,
              isLiked: 1,
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

    {
      $project: {
        videos: 1,
        total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
      },
    },
  ];

  const result = await Video.aggregate(pipeline);

  const videos = result[0]?.videos || [];
  const total = result[0]?.total || 0;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Channel videos fetched successfully"
    )
  );
});

const getVideoDetails = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const userId = req.user?._id
    ? new mongoose.Types.ObjectId(req.user._id)
    : null;

  // Increment views (non-blocking)
  Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } }).exec();

  const pipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
        isPublished: true,
        isDeleted: false,
      },
    },

    // Owner details
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    { $unwind: "$owner" },

    // Likes count
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      },
    },

    // Comments count
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "video",
        as: "comments",
      },
    },

    // Subscribers count
    {
      $lookup: {
        from: "subscriptions",
        localField: "owner._id",
        foreignField: "channel",
        as: "subscribers",
      },
    },

    // Add computed fields
    {
      $addFields: {
        likesCount: { $size: "$likes" },
        commentsCount: { $size: "$comments" },
        subscribersCount: {
          $size: {
            $filter: {
              input: "$subscribers",
              as: "sub",
              cond: { $eq: ["$$sub.isSubscribed", true] },
            },
          },
        },
      },
    },

    // isLiked (current user)
    ...(userId
      ? [
          {
            $lookup: {
              from: "likes",
              let: { videoId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$video", "$$videoId"] },
                        { $eq: ["$likedBy", userId] },
                      ],
                    },
                  },
                },
              ],
              as: "likedData",
            },
          },
          {
            $addFields: {
              isLiked: { $gt: [{ $size: "$likedData" }, 0] },
            },
          },
        ]
      : [
          {
            $addFields: { isLiked: false },
          },
        ]),

    // isSubscribed
    ...(userId
      ? [
          {
            $lookup: {
              from: "subscriptions",
              let: { ownerId: "$owner._id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$channel", "$$ownerId"] },
                        { $eq: ["$subscriber", userId] },
                        { $eq: ["$isSubscribed", true] },
                      ],
                    },
                  },
                },
              ],
              as: "subscriptionData",
            },
          },
          {
            $addFields: {
              isSubscribed: { $gt: [{ $size: "$subscriptionData" }, 0] },
            },
          },
        ]
      : [
          {
            $addFields: { isSubscribed: false },
          },
        ]),

    // Final response
    {
      $project: {
        videoFile: 1,
        thumbnail: 1,
        title: 1,
        description: 1,
        duration: 1,
        views: 1,
        createdAt: 1,
        likesCount: 1,
        commentsCount: 1,
        isLiked: 1,
        isSubscribed: 1,
        owner: {
          _id: "$owner._id",
          username: "$owner.username",
          avatar: "$owner.avatar",
        },
        subscribersCount: 1,
      },
    },
  ];

  const result = await Video.aggregate(pipeline);

  const video = result[0];

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  res.status(200).json(
    new ApiResponse(200, video, "Video details fetched successfully")
  );
});

export {
  toggleSubscription,
  getUserSubscriptions,
  getChannelSubscribers,
  getChannelProfile,
  getChannelVideos,
  getVideoDetails
};