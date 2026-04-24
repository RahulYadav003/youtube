import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    subscriber: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    channel: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Soft unsubscribe system
    isSubscribed: {
      type: Boolean,
      default: true,
    },

    unsubscribedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

//
// INDEXES
//

// Prevent duplicate subscriptions
subscriptionSchema.index(
  { subscriber: 1, channel: 1 },
  { unique: true }
);

// Fast queries
subscriptionSchema.index({ channel: 1, createdAt: -1 });
subscriptionSchema.index({ subscriber: 1, createdAt: -1 });

//
// VALIDATION
//

// Prevent self-subscription
subscriptionSchema.pre("save", function (next) {
  if (this.subscriber.equals(this.channel)) {
    return next(new Error("You cannot subscribe to yourself"));
  }
  next();
});

export const Subscription = mongoose.model(
  "Subscription",
  subscriptionSchema
);