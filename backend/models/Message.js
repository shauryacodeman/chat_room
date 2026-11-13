const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: String,
    sender: String,
    text: String,
    upvotes: { type: Number, default: 0 },
    upvotedBy: { type: [String], default: [] }, // NEW: Tracks who upvoted
  },
  { timestamps: true },
);

module.exports = mongoose.model("Message", messageSchema);
