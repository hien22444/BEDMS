const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const RoomInspectionSchema = new mongoose.Schema({
  room: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM,
  },
  contract: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.CONTRACT,
    default: null,
  },
  inspection_type: {
    type: String,
    required: true,
    enum: ['check_in', 'check_out', 'periodic', 'complaint'],
  },
  cleanliness_status: {
    type: String,
    required: true,
    enum: ['clean', 'dirty', 'needs_cleaning'],
  },
  equipment_status: {
    type: String,
    required: true,
    enum: ['complete', 'missing', 'damaged'],
  },
  equipment_notes: {
    type: String,
  },
  maintenance_needed: {
    type: String,
  },
  inspection_photos_urls: {
    type: [String],
  },
  inspected_by: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STAFF,
  },
  inspected_at: {
    type: Date,
    default: Date.now,
  },
});

RoomInspectionSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const RoomInspection = mongoose.model(DBCollections.ROOM_INSPECTION, RoomInspectionSchema);

module.exports = RoomInspection;
