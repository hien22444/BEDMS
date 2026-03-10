const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const RoomTransferRequestSchema = new mongoose.Schema({
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  current_room: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM,
  },
  requested_room: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM,
  },
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
  },
  rejection_reason: {
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
});

RoomTransferRequestSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const RoomTransferRequest = mongoose.model(
  DBCollections.ROOM_TRANSFER_REQUEST,
  RoomTransferRequestSchema
);

module.exports = RoomTransferRequest;
