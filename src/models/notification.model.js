const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.USER,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  notification_type: {
    type: String,
    default: "info",
    enum: ["info", "warning", "error", "success"],
  },
  category: {
    type: String,
    required: true,
    enum: [
      "payment",
      "booking",
      "maintenance",
      "violation",
      "visitor",
      "equipment",
      "general",
    ],
  },
  is_read: {
    type: Boolean,
    default: false,
  },
  related_id: {
    type: String,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

NotificationSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Notification = mongoose.model(
  DBCollections.NOTIFICATION,
  NotificationSchema
);

module.exports = Notification;
