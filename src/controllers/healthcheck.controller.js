import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import asyncHandler from "../utils/asyncHandler";

const healthCheck = asyncHandler(async (req, res) => {
  // Example: check database connection
  const dbStatus = mongoose.connection.readyState === 1 ? "up" : "down";

  if (dbStatus !== "up") {
    throw new ApiError(500, "Database is down");
  }

  res.status(200).json(
    new ApiResponse(200, {
      status: "ok",
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }, "Server is healthy")
  );
});

export { healthCheck };