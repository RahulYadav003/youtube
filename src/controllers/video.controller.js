import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { Video } from "../models/video.js";
import { Like } from "../models/like.js"
import jwt from "jsonwebtoken";
import mongoose from "mongoose";


//GET ALL VIDEOS (aggregation + likes + views)
const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query,
    sortBy = "createdAt",
    sortType = "desc",
    userId
  } = req.query;

  const matchStage = {};

  if (query) {
    matchStage.$or = [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } }
    ];
  }

  if (userId) {
    matchStage.owner = new mongoose.Types.ObjectId(userId);
  }

  const sortOrder = sortType === "asc" ? 1 : -1;

  const aggregate = Video.aggregate([
    { $match: matchStage },

    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes"
      }
    },
    {
      $addFields: {
        likesCount: { $size: "$likes" }
      }
    },
    {
      $project: {
        likes: 0
      }
    },

    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner"
      }
    },
    { $unwind: "$owner" },

    {
      $sort: { [sortBy]: sortOrder }
    }
  ]);

  const options = {
    page: parseInt(page),
    limit: parseInt(limit)
  };

  const result = await Video.aggregatePaginate(aggregate, options);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Videos fetched successfully"));
});

//PUBLISH VIDEO
const publishVideo = asyncHandler(async (req, res) => {
  const { title, description, duration } = req.body;

  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];

  if (!videoFile || !thumbnailFile) {
    throw new ApiError(400, "Video and thumbnail are required");
  }

  const uploadedVideo = await uploadCloudinary(videoFile.path);
  const uploadedThumbnail = await uploadCloudinary(thumbnailFile.path);

  const video = await Video.create({
    title,
    description,
    duration,
    videoFile: uploadedVideo.secure_url,
    thumbnail: uploadedThumbnail.secure_url,
    owner: req.user._id
  });

  return res
    .status(201)
    .json(new ApiResponse(201, video, "Video published"));
});

//GET VIDEO BY ID + increment views
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid ID");
  }

  const video = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { views: 1 } },
    { new: true }
  );

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched"));
});

//UPDATE VIDEO
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;

  const video = await Video.findById(videoId);

  if (!video) throw new ApiError(404, "Video not found");

  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Unauthorized");
  }

  const thumbnailFile = req.files?.thumbnail?.[0];

  if (thumbnailFile) {
    await deleteFromCloudinary(video.thumbnail);
    const uploaded = await uploadCloudinary(thumbnailFile.path);
    video.thumbnail = uploaded.secure_url;
  }

  if (title) video.title = title;
  if (description) video.description = description;

  await video.save();

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video updated"));
});

//DELETE VIDEO
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const video = await Video.findById(videoId);

  if (!video) throw new ApiError(404, "Video not found");

  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Unauthorized");
  }

  await deleteFromCloudinary(video.videoFile);
  await deleteFromCloudinary(video.thumbnail);

  await video.deleteOne();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video deleted"));
});

//TOGGLE LIKE
const toggleLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user._id;

  const existing = await Like.findOne({
    video: videoId,
    likedBy: userId
  });

  if (existing) {
    await existing.deleteOne();
    return res.json(new ApiResponse(200, {}, "Unliked"));
  }

  await Like.create({
    video: videoId,
    likedBy: userId
  });

  return res.json(new ApiResponse(200, {}, "Liked"));
});

export {
  getAllVideos,
  publishVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  toggleLike
};