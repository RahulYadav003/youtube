<!-- import mongoose from "mongoose";
import { DB_NAME } from "./src/constants.js";

import express from "express";
const app = express();
(async () => {
  try {
    await mongoose.connect(`${process.env.MONGO_URL}/${DB_NAME}`);
    app.on("error", (error) => {
      console.log("Error connecting to MongoDB: ", error);
      throw error;
    })

    app.listen(process.env.PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });

  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
})() -->