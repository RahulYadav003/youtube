import mongoose from "mongoose";
import Comment from "../models/comment.model.js";
import asyncHandler from "express-async-handler";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  let { page = 1, limit = 10 } = req.query;

  // Validate videoId
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }

  // Convert to numbers safely
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 10, 1);

  // Fetch comments
  const comments = await Comment.find({ video: videoId })
    .populate("user", "username avatar")
    .sort({ createdAt: -1 }) // newest first
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean(); // improves performance

  // Total count for pagination
  const total = await Comment.countDocuments({ video: videoId });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        comments,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Comments fetched successfully"
    )
  );
});

const addComment = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { content } = req.body;

  // Validate videoId
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  // Validate content
  if (!content || !content.trim()) {
    throw new ApiError(400, "Content is required");
  }

  // Optional: check if video exists
  const videoExists = await Video.findById(videoId);
  if (!videoExists) {
    throw new ApiError(404, "Video not found");
  }

  // Create comment
  const comment = await Comment.create({
    content: content.trim(),
    video: videoId,
    user: req.user._id,
  });

  // Populate user info (better response for frontend)
  const populatedComment = await comment.populate("user", "username avatar");

  res.status(201).json(
    new ApiResponse(201, populatedComment, "Comment added successfully")
  );
});

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;

  // Validate commentId
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }

  // Validate content
  if (!content || !content.trim()) {
    throw new ApiError(400, "Content is required");
  }

  // Find comment
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  // Authorization: only owner can edit
  if (comment.user.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this comment");
  }

  // Update content
  comment.content = content.trim();
  await comment.save();

  // Populate user info (optional but useful)
  const updatedComment = await comment.populate("user", "username avatar");

  res.status(200).json(
    new ApiResponse(200, updatedComment, "Comment updated successfully")
  );
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  if (!comment.user.equals(req.user._id)) {
    throw new ApiError(403, "You are not allowed to delete this comment");
  }

  await comment.deleteOne();

  res.status(200).json(
    new ApiResponse(200, null, "Comment deleted successfully")
  );
});

export {
  getVideoComments,
  addComment,
  updateComment,
  deleteComment
};