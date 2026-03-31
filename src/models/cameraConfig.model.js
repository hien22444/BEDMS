const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const CameraConfigSchema = new mongoose.Schema(
  {
    camera_id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    location: {
      type: String,
    },
    type: {
      type: String,
      required: true,
      enum: ['checkin', 'checkout'],
    },
    source_type: {
      type: String,
      required: true,
      enum: ['webcam', 'rtsp'],
    },
    source_url: {
      type: String,
      required: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    fps_target: {
      type: Number,
      default: 5,
    },
    recognition_threshold: {
      type: Number,
      default: 0.6,
    },
  },
  {
    timestamps: true,
  }
);

CameraConfigSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const CameraConfig = mongoose.model(
  DBCollections.CAMERA_CONFIG,
  CameraConfigSchema
);

module.exports = CameraConfig;
