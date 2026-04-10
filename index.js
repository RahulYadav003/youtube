import dotenv from "dotenv";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";

dotenv.config();


connectDB()
.then( () => {
  app.listen(process.env.PORT || 5000, () => {
    console.log(`Server is running on port ${process.env.PORT || 5000}`);
  });
  app.on("error", (error) => {
    console.log("SERVER ERROR: ", error);
  });

})
.catch((error) => {
  console.log("DB CONNECTION FAILED: ", error);
});
