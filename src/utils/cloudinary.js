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
    // upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // file has been uploaded successfully
    // console.log("file is uploaded on cloudinary", response.url);
    fs.unlinkSync(localFilePath)
    return response;
    // console.log(response);
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload operation got failed
    return null;
  }
};

const deleteFromCloudinary = async (publicUrl) => {
  try {
    if (!publicUrl) return null;

    // Extract public_id from URL, handling optional folder paths
    // e.g. "https://res.cloudinary.com/<cloud>/image/upload/v123/folder/filename.jpg"
    //       → public_id = "folder/filename"
    const urlParts = publicUrl.split("/");
    const uploadIndex = urlParts.indexOf("upload");
    const publicId = urlParts
      .slice(uploadIndex + 2)   // skip "upload" and the version segment (v123456)
      .join("/")
      .split(".")[0];            // strip file extension

    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    return null;
  }
};

export {uploadCloudinary, deleteFromCloudinary}