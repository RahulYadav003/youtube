import { Router } from "express";
import {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  restorePlaylist,
  getDeletedPlaylists,
  permanentlyDeletePlaylist,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  reorderPlaylistVideos,
} from "../controllers/playlist.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protected routes
router.use(verifyJWT);

// CRUD
router.post("/", createPlaylist);
router.get("/user/:userId", getUserPlaylists);
router.get("/:playlistId", getPlaylistById);
router.patch("/:playlistId", updatePlaylist);

// Trash system
router.delete("/:playlistId", deletePlaylist);
router.patch("/:playlistId/restore", restorePlaylist);
router.get("/trash", getDeletedPlaylists);
router.delete("/:playlistId/permanent", permanentlyDeletePlaylist);

// Video management
router.post("/:playlistId/videos/:videoId", addVideoToPlaylist);
router.delete("/:playlistId/videos/:videoId", removeVideoFromPlaylist);
router.patch("/:playlistId/reorder", reorderPlaylistVideos);

export default router;