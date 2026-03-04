const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const ChatConversationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.STUDENT,
    },
    staff: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STAFF,
      default: null,
    },
    status: {
      type: String,
      default: "open",
      enum: ["open", "closed"],
    },
  },
  {
    timestamps: true,
  }
);

ChatConversationSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const ChatConversation = mongoose.model(
  DBCollections.CHAT_CONVERSATION,
  ChatConversationSchema
);

module.exports = ChatConversation;
