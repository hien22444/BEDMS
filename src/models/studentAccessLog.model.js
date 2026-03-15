const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const StudentAccessLogSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STUDENT,
      default: null,
    },
    type: {
      type: String,
      required: true,
      enum: ['check_in', 'check_out'],
    },
    method: {
      type: String,
      required: true,
      enum: ['face_recognition', 'manual'],
    },
    camera_id: {
      type: String,
    },
    confidence: {
      type: Number,
      default: null,
    },
    face_snapshot_url: {
      type: String,
    },
    logged_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.USER,
      default: null,
    },
    manual_reason: {
      type: String,
    },
    visitor_name: {
      type: String,
    },
    id_card: {
      type: String,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

StudentAccessLogSchema.index({ createdAt: -1 });
StudentAccessLogSchema.index({ student: 1, createdAt: -1 });
StudentAccessLogSchema.index({ type: 1, createdAt: -1 });

StudentAccessLogSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const StudentAccessLog = mongoose.model(
  DBCollections.STUDENT_ACCESS_LOG,
  StudentAccessLogSchema
);

module.exports = StudentAccessLog;
