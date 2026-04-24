import { Router } from "express";
import{ getAllVideos,
  publishVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  toggleLike } from "../controllers/video.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyJWT);

router.route("/").get(getAllVideos).post(publishVideo);
router.route("/:videoId").get(getVideoById).patch(updateVideo).delete(deleteVideo);
router.route("/:videoId/like").post(toggleLike);

export default router;