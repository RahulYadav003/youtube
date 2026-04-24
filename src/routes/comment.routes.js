import { Router } from "express";
import {
  getVideoComments,
  addComment,
  updateComment,
  deleteComment
} from "../controllers/comment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.route("/:videoId/comments").get(getVideoComments);
router.route("/c/:videoId/comments").post(addComment);
router.route("/comments/:commentId").patch(updateComment);
router.route("/comments/:commentId").delete(deleteComment);

export default router;