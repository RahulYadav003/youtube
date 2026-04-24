import mongoose, { Schema } from "mongoose";

const tweetSchema = new Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 280,
    },

    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Optional media support
    media: [
      {
        type: String, // URL
      },
    ],

    // Performance fields (VERY IMPORTANT)
    likesCount: {
      type: Number,
      default: 0,
    },

    repliesCount: {
      type: Number,
      default: 0,
    },

    // For threading (reply system)
    parentTweet: {
      type: Schema.Types.ObjectId,
      ref: "Tweet",
      default: null,
    },

    // Soft delete (optional but recommended)
    isDeleted: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    // add to tweetSchema
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Index for fast feed queries
tweetSchema.index({ owner: 1, createdAt: -1 });
tweetSchema.index({ createdAt: -1 });

// Trash queries
tweetSchema.index({ owner: 1, isDeleted: 1, deletedAt: -1 });

// TTL auto-delete (30 days)
tweetSchema.index(
  { deletedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 }
);

tweetSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeDeleted) {
    this.where({ isDeleted: false });
  }
  delete this.getQuery().includeDeleted;
  next();
});


export const Tweet = mongoose.model("Tweet", tweetSchema);