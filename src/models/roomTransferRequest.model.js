const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const RoomTransferRequestSchema = new mongoose.Schema({
  request_code: {
    type: String,
    required: true,
    unique: true,
  },
  transfer_type: {
    type: String,
    required: true,
    enum: ['target_empty', 'swap'],
  },
  initiator_student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  target_student: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STUDENT,
    default: null,
  },
  current_room: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM,
  },
  current_bed: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.BED,
  },
  requested_room: {
    type: mongoose.Types.ObjectId,
    required: false,
    ref: DBCollections.ROOM,
    default: null,
  },
  requested_bed: {
    type: mongoose.Types.ObjectId,
    required: false,
    ref: DBCollections.BED,
    default: null,
  },
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'pending_manager',
    enum: [
      'pending_partner',
      'pending_manager',
      'pending_payment_upgrade',
      'pending_refund_office',
      'approved',
      'rejected',
      'cancelled',
    ],
  },
  /** Before semester: upgrade / downgrade / none; swap always none */
  price_adjustment_type: {
    type: String,
    enum: ['none', 'upgrade', 'downgrade'],
    default: 'none',
  },
  supplement_amount: {
    type: Number,
    default: 0,
  },
  payment_deadline: {
    type: Date,
    default: null,
  },
  refund_deadline: {
    type: Date,
    default: null,
  },
  supplement_invoice: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.INVOICE,
    default: null,
  },
  refund_confirmed_at: {
    type: Date,
    default: null,
  },
  partner_response_at: {
    type: Date,
    default: null,
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
