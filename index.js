import dotenv from "dotenv";
dotenv.config();

import connectDB from "./src/config/db.js";
import app from "./src/app.js";




connectDB()
  .then(() => {
    const server = app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running on port ${process.env.PORT || 8000}`);
    });

    server.on("error", (error) => {
      console.error("SERVER ERROR:", error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.log("DB CONNECTION FAILED:", error);
    process.exit(1);
  });