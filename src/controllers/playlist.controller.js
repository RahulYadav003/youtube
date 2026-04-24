import mongoose, {isValidObjectId} from "mongoose";
import {Playlist} from "../models/playlist.model.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler";


const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description, isPublic } = req.body;

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  if (!name || !name.trim()) {
    throw new ApiError(400, "Playlist name is required");
  }

  const trimmedName = name.trim();
  const trimmedDescription = description?.trim() || "No description";

  const playlist = await Playlist.create({
    name: trimmedName,
    description: trimmedDescription,
    owner: req.user._id,
    isPublic: isPublic ?? true,
  });

  res.status(201).json(
    new ApiResponse(201, playlist, "Playlist created successfully")
  );
});

const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Validate userId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const isOwner = req.user._id.toString() === userId;

  let { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);

  // Build query
  const query = {
    owner: userId,
    ...(isOwner ? {} : { isPublic: true }) // hide private playlists
  };

  const playlists = await Playlist.find(query)
    .populate("owner", "username avatar")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  const total = await Playlist.countDocuments(query);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        playlists,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "User playlists retrieved successfully"
    )
  );
});

const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  let { page = 1, limit = 10, search = "" } = req.query;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);
  const skip = (pageNum - 1) * limitNum;

  const pipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(playlistId),
      },
    },

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

    // Unwind videos (order preserved automatically)
    {
      $unwind: {
        path: "$videos",
        preserveNullAndEmptyArrays: false,
      },
    },

    // Join video
    {
      $lookup: {
        from: "videos",
        localField: "videos.video",
        foreignField: "_id",
        as: "video",
      },
    },
    { $unwind: "$video" },

    // Filter only published videos (optional but recommended)
    {
      $match: {
        "video.isPublished": true,
      },
    },

    // Search (optional)
    ...(search
      ? [
          {
            $match: {
              "video.title": {
                $regex: search,
                $options: "i",
              },
            },
          },
        ]
      : []),

    // Join video owner
    {
      $lookup: {
        from: "users",
        localField: "video.owner",
        foreignField: "_id",
        as: "videoOwner",
      },
    },
    { $unwind: "$videoOwner" },

    // Shape video object
    {
      $addFields: {
        "video.owner": {
          _id: "$videoOwner._id",
          username: "$videoOwner.username",
          avatar: "$videoOwner.avatar",
        },
      },
    },

    // FACET (data + count in one query)
    {
      $facet: {
        videos: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: "$video._id",
              title: "$video.title",
              thumbnail: "$video.thumbnail",
              owner: "$video.owner",
              createdAt: "$video.createdAt",
            },
          },
        ],
        totalCount: [
          { $count: "count" }
        ],
        playlistMeta: [
          {
            $group: {
              _id: "$_id",
              name: { $first: "$name" },
              description: { $first: "$description" },
              isPublic: { $first: "$isPublic" },
              owner: {
                $first: {
                  _id: "$owner._id",
                  username: "$owner.username",
                  avatar: "$owner.avatar",
                },
              },
            },
          },
        ],
      },
    },

    // Restructure response
    {
      $project: {
        videos: 1,
        totalVideos: { $arrayElemAt: ["$totalCount.count", 0] },
        playlist: { $arrayElemAt: ["$playlistMeta", 0] },
      },
    },
  ];

  const result = await Playlist.aggregate(pipeline);

  if (!result.length || !result[0].playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  const { playlist, videos, totalVideos = 0 } = result[0];

  // Privacy check
  const isOwner =
    playlist.owner._id.toString() === req.user._id.toString();

  if (!playlist.isPublic && !isOwner) {
    throw new ApiError(403, "This playlist is private");
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...playlist,
        videos,
        totalVideos,
        page: pageNum,
        totalPages: Math.ceil(totalVideos / limitNum),
      },
      "Playlist retrieved successfully"
    )
  );
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  if (
    !mongoose.Types.ObjectId.isValid(playlistId) ||
    !mongoose.Types.ObjectId.isValid(videoId)
  ) {
    throw new ApiError(400, "Invalid IDs");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, "Playlist not found");

  if (!playlist.owner.equals(req.user._id)) {
    throw new ApiError(403, "Not allowed");
  }

  // prevent duplicate
  const exists = playlist.videos.some(
    (v) => v.video.toString() === videoId
  );
  if (exists) {
    throw new ApiError(400, "Video already exists in playlist");
  }

  const position = playlist.videos.length;

  const updated = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $push: {
        videos: {
          video: videoId,
          addedAt: new Date(),
          position,
        },
      },
    },
    { new: true }
  );

  res.status(200).json(
    new ApiResponse(200, updated, "Video added successfully")
  );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  if (
    !mongoose.Types.ObjectId.isValid(playlistId) ||
    !mongoose.Types.ObjectId.isValid(videoId)
  ) {
    throw new ApiError(400, "Invalid IDs");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, "Playlist not found");

  if (!playlist.owner.equals(req.user._id)) {
    throw new ApiError(403, "Not allowed");
  }

  // Remove video
  await Playlist.findByIdAndUpdate(playlistId, {
    $pull: { videos: { video: videoId } },
  });

  // Reorder positions
  const updated = await Playlist.findById(playlistId);

  updated.videos = updated.videos
    .sort((a, b) => a.position - b.position)
    .map((v, index) => ({
      ...v.toObject(),
      position: index,
    }));

  await updated.save();

  res.status(200).json(
    new ApiResponse(200, updated, "Video removed successfully")
  );
});

const reorderPlaylistVideos = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { orderedVideoIds } = req.body; // array of videoIds in new order

  if (!mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!Array.isArray(orderedVideoIds)) {
    throw new ApiError(400, "orderedVideoIds must be an array");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, "Playlist not found");

  if (!playlist.owner.equals(req.user._id)) {
    throw new ApiError(403, "Not allowed");
  }

  // Validate all IDs exist in playlist
  const existingIds = playlist.videos.map((v) => v.video.toString());

  if (
    orderedVideoIds.length !== existingIds.length ||
    !orderedVideoIds.every((id) => existingIds.includes(id))
  ) {
    throw new ApiError(400, "Invalid reorder list");
  }

  // Reorder
  const reorderedVideos = orderedVideoIds.map((id, index) => {
    const original = playlist.videos.find(
      (v) => v.video.toString() === id
    );

    return {
      ...original.toObject(),
      position: index,
    };
  });

  playlist.videos = reorderedVideos;
  await playlist.save();

  res.status(200).json(
    new ApiResponse(200, playlist, "Playlist reordered successfully")
  );
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const playlist = await Playlist.findOneAndUpdate(
    {
      _id: playlistId,
      owner: req.user._id,
      isDeleted: false, // important
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!playlist) {
    throw new ApiError(
      404,
      "Playlist not found or already deleted or not authorized"
    );
  }

  res.status(200).json(
    new ApiResponse(200, null, "Playlist deleted successfully")
  );
});

const restorePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const playlist = await Playlist.findOneAndUpdate(
    {
      _id: playlistId,
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
  ).setOptions({ includeDeleted: true });

  if (!playlist) {
    throw new ApiError(404, "Playlist not found in trash");
  }

  res.status(200).json(
    new ApiResponse(200, playlist, "Playlist restored successfully")
  );
});

const getDeletedPlaylists = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  let { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);

  const query = {
    owner: req.user._id,
    isDeleted: true,
  };

  const playlists = await Playlist.find(query)
    .setOptions({ includeDeleted: true }) // 🔥 override middleware
    .sort({ deletedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  const total = await Playlist.countDocuments(query);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        playlists,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Deleted playlists fetched successfully"
    )
  );
});

const permanentlyDeletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const deleted = await Playlist.findOneAndDelete({
    _id: playlistId,
    owner: req.user._id,
    isDeleted: true, // only from trash
  }).setOptions({ includeDeleted: true });

  if (!deleted) {
    throw new ApiError(404, "Playlist not found in trash");
  }

  res.status(200).json(
    new ApiResponse(200, null, "Playlist permanently deleted")
  );
});

const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description, isPublic } = req.body;

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  // Auth check
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  // Build update object (only update provided fields)
  const updateFields = {};

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ApiError(400, "Playlist name cannot be empty");
    }
    updateFields.name = name.trim();
  }

  if (description !== undefined) {
    updateFields.description = description.trim() || "No description";
  }

  if (isPublic !== undefined) {
    updateFields.isPublic = Boolean(isPublic);
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  // 🔍 Optional: prevent duplicate playlist name per user
  if (updateFields.name) {
    const existing = await Playlist.findOne({
      owner: req.user._id,
      name: updateFields.name,
      _id: { $ne: playlistId },
    });

    if (existing) {
      throw new ApiError(400, "Playlist with this name already exists");
    }
  }

  // ✅ Atomic update (with ownership + soft delete check)
  const playlist = await Playlist.findOneAndUpdate(
    {
      _id: playlistId,
      owner: req.user._id,
      isDeleted: false,
    },
    {
      $set: updateFields,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!playlist) {
    throw new ApiError(
      404,
      "Playlist not found or you are not authorized or it is deleted"
    );
  }

  res.status(200).json(
    new ApiResponse(
      200,
      playlist,
      "Playlist updated successfully"
    )
  );
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  restorePlaylist,
  getDeletedPlaylists,
  permanentlyDeletePlaylist
};