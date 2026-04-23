import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    // safe delete
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    return response;
  } catch (error) {
    console.error("Cloudinary upload failed:", error);

    // safe delete in catch
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    return null;
  }
};

const deleteFromCloudinary = async (fileUrl) => {
  try {
    if (!fileUrl) return null;

    //  safer public_id extraction
    const parts = fileUrl.split("/upload/");
    if (parts.length < 2) return null;

    const path = parts[1].replace(/^v\d+\//, ""); // remove version
    const publicId = path.replace(/\.[^/.]+$/, ""); // remove extension

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "auto", // handles image/video/raw
    });

    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    return null;
  }
};

export { uploadCloudinary, deleteFromCloudinary };