const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const ChatConversationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.USER,
    },
    staff: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.USER,
      default: null,
    },
    status: {
      type: String,
      default: 'open',
      enum: ['open', 'closed'],
    },
    manager_unread: {
      type: Number,
      default: 0,
    },
    student_unread: {
      type: Number,
      default: 0,
    },
    last_message_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// 1 student chỉ có 1 open conversation tại một thời điểm
ChatConversationSchema.index({ student: 1, status: 1 });
// Manager query conversations sorted by latest activity
ChatConversationSchema.index({ status: 1, last_message_at: -1 });

ChatConversationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const ChatConversation = mongoose.model(DBCollections.CHAT_CONVERSATION, ChatConversationSchema);

module.exports = ChatConversation;
