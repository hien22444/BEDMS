const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const ChatMessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.CHAT_CONVERSATION,
  },
  sender: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.USER,
  },
  sender_type: {
    type: String,
    required: true,
    enum: ["student", "staff"],
  },
  message_text: {
    type: String,
    required: true,
  },
  attachment_url: {
    type: String,
  },
  is_read: {
    type: Boolean,
    default: false,
  },
  sent_at: {
    type: Date,
    default: Date.now,
  },
});

ChatMessageSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const ChatMessage = mongoose.model(
  DBCollections.CHAT_MESSAGE,
  ChatMessageSchema
);

module.exports = ChatMessage;
