import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
  {
    videoFile: {
      type: String,
      required: true,
      trim: true,
    },

    thumbnail: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    duration: {
      type: Number,
      required: true,
      min: 0,
    },

    views: {
      type: Number,
      default: 0,
    },

    // Engagement (important for performance)
    likesCount: {
      type: Number,
      default: 0,
    },

    commentsCount: {
      type: Number,
      default: 0,
    },

    isPublished: {
      type: Boolean,
      default: true,
    },

    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Soft delete system
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

//
// PLUGINS
//
videoSchema.plugin(mongooseAggregatePaginate);

//
// INDEXES (VERY IMPORTANT)
//

// Channel videos
videoSchema.index({ owner: 1, createdAt: -1 });

// Feed / latest videos
videoSchema.index({ createdAt: -1 });

// Popular videos
videoSchema.index({ views: -1 });

// Search (basic)
videoSchema.index({ title: "text", description: "text" });

//
// AUTO FILTER DELETED VIDEOS
//
videoSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeDeleted) {
    this.where({ isDeleted: false });
  }
  delete this.getQuery().includeDeleted;
  next();
});

export const Video = mongoose.model("Video", videoSchema);