import { Router } from 'express';
import {  toggleSubscription,
  getUserSubscriptions,
  getChannelSubscribers,
  getChannelProfile,
  getChannelVideos,
  getVideoDetails,} from '../controllers/subscription.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Protected routes
router.use(verifyJWT);

// Subscription management
router.post("/toggle", toggleSubscription);
router.get("/user/:userId", getUserSubscriptions);

// Channel information
router.get("/channel/:channelId/subscribers", getChannelSubscribers);
router.get("/channel/:channelId/profile", getChannelProfile);
router.get("/channel/:channelId/videos", getChannelVideos);

// Video details
router.get("/video/:videoId", getVideoDetails);

export default router;