import mongoose, { Schema } from "mongoose";

const likeSchema = new Schema(
  {
    video: {
      type: Schema.Types.ObjectId,
      ref: "Video",
    },
    comment: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
    },
    tweet: {
      type: Schema.Types.ObjectId,
      ref: "Tweet",
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure exactly ONE target is set
likeSchema.pre("validate", function (next) {
  const targets = [this.video, this.comment, this.tweet].filter(Boolean);

  if (targets.length !== 1) {
    return next(new Error("Like must belong to exactly one target"));
  }

  next();
});

// Prevent duplicate likes (one like per user per target)
likeSchema.index(
  { video: 1, user: 1 },
  { unique: true, partialFilterExpression: { video: { $exists: true } } }
);

likeSchema.index(
  { comment: 1, user: 1 },
  { unique: true, partialFilterExpression: { comment: { $exists: true } } }
);

likeSchema.index(
  { tweet: 1, user: 1 },
  { unique: true, partialFilterExpression: { tweet: { $exists: true } } }
);

export const Like = mongoose.model("Like", likeSchema);