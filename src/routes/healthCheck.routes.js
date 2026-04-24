import { Router } from "express";
import {healthCheck} from "../controllers/healthcheck.controller.js";

const router = Router();

router.use(verifyJWT);

router.route("/").get(healthCheck);

export default router;