import mongoose, { Schema } from "mongoose";

const playlistSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    default: "No description",
    trim: true
  },
  videos: [
    {
      video: {
        type: Schema.Types.ObjectId,
        ref: "Video"
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      position: {
        type: Number,
        required: true,
      },
    }
  ],
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true })


playlistSchema.index(
  { owner: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

// Auto-hide deleted playlists
playlistSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeDeleted) {
    this.where({ isDeleted: false });
  }
  delete this.getQuery().includeDeleted;
  next();
});

export const Playlist = mongoose.model("Playlist", playlistSchema)