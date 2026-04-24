import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { Video } from "../models/video.js";
import { Subscription } from "../models/subscription.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

const getDashboardStats = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = new mongoose.Types.ObjectId(req.user._id);

  // Dates
  const now = new Date();
  const last7Days = new Date();
  last7Days.setDate(now.getDate() - 7);

  const last30Days = new Date();
  last30Days.setDate(now.getDate() - 30);

  const [
    // Overall stats
    videoStats,

    // Subscribers count
    subscribersCount,

    // Last 7 days views
    last7DaysViews,

    // Last 30 days subscribers
    last30DaysSubscribers,

    // Top videos
    topVideos,

    // 📉 Daily graph (views)
    dailyViews,
  ] = await Promise.all([
    // Total stats
    Video.aggregate([
      {
        $match: {
          owner: userId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalVideos: { $sum: 1 },
          totalViews: { $sum: "$views" },
          totalLikes: { $sum: "$likesCount" },
        },
      },
    ]),

    // Subscribers count
    Subscription.countDocuments({
      channel: userId,
      isSubscribed: true,
    }),

    // Last 7 days views (approx based on created videos)
    Video.aggregate([
      {
        $match: {
          owner: userId,
          createdAt: { $gte: last7Days },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          views: { $sum: "$views" },
        },
      },
    ]),

    // Last 30 days subscribers
    Subscription.countDocuments({
      channel: userId,
      isSubscribed: true,
      createdAt: { $gte: last30Days },
    }),

    // Top performing videos
    Video.find({
      owner: userId,
      isDeleted: false,
    })
      .sort({ views: -1 })
      .limit(5)
      .select("title thumbnail views likesCount createdAt")
      .lean(),

    // Daily views graph
    Video.aggregate([
      {
        $match: {
          owner: userId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: "$createdAt" },
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" },
          },
          views: { $sum: "$views" },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]),
  ]);

  const stats = videoStats[0] || {
    totalVideos: 0,
    totalViews: 0,
    totalLikes: 0,
  };

  const views7Days = last7DaysViews[0]?.views || 0;

  // Engagement rate
  const engagementRate =
    stats.totalViews > 0
      ? (stats.totalLikes / stats.totalViews).toFixed(2)
      : 0;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        totalVideos: stats.totalVideos,
        totalViews: stats.totalViews,
        totalLikes: stats.totalLikes,
        subscribersCount,

        // Upgrades
        last7DaysViews: views7Days,
        last30DaysSubscribers,
        topVideos,
        engagementRate,

        // Graph
        dailyViews,
      },
      "Dashboard analytics fetched successfully"
    )
  );
});

export { getDashboardStats };