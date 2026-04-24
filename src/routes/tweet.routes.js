import { Router } from "express";
import { createTweet,
  getUserTweets,
  updateTweet,
  deleteTweet,
  restoreTweet,
  permanentlyDeleteTweet
} from "../controllers/tweet.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protected routes
router.use(verifyJWT);

router.route("/").post(createTweet);
router.route("/user/:userId").get(getUserTweets);
router.route("/:tweetId").patch(updateTweet).delete(deleteTweet);
router.route("/restore/:tweetId").post(restoreTweet);
router.route("/permanent/:tweetId").delete(permanentlyDeleteTweet);

export default router;