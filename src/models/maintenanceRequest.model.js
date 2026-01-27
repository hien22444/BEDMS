const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const MaintenanceRequestSchema = new mongoose.Schema({
  request_code: {
    type: String,
    required: true,
    unique: true,
  },
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  room: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM,
  },
  equipment: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.ROOM_EQUIPMENT,
    default: null,
  },
  issue_type: {
    type: String,
    required: true,
    enum: ["electrical", "water", "ac", "furniture", "cleaning", "other"],
  },
  priority: {
    type: String,
    required: true,
    enum: ["urgent", "high", "medium", "low"],
  },
  description: {
    type: String,
    required: true,
  },
  evidence_urls: {
    type: [String],
  },
  status: {
    type: String,
    default: "pending",
    enum: [
      "pending",
      "approved",
      "rejected",
      "assigned",
      "in_progress",
      "waiting_parts",
      "completed",
      "done",
      "need_rework",
      "cannot_fix",
      "cancelled",
    ],
  },
  rejection_reason: {
    type: String,
  },
  technician_name: {
    type: String,
  },
  technician_phone: {
    type: String,
  },
  scheduled_time: {
    type: Date,
  },
  completion_notes: {
    type: String,
  },
  requested_at: {
    type: Date,
    default: Date.now,
  },
  reviewed_at: {
    type: Date,
    default: null,
  },
  reviewed_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  completed_at: {
    type: Date,
    default: null,
  },
});

MaintenanceRequestSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const MaintenanceRequest = mongoose.model(
  DBCollections.MAINTENANCE_REQUEST,
  MaintenanceRequestSchema
);

module.exports = MaintenanceRequest;
