const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const CheckoutRequestSchema = new mongoose.Schema(
  {
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
    contract: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.CONTRACT,
    },
    room: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.ROOM,
    },
    bed: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.BED,
    },
    expected_checkout_date: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'inspected', 'pending_payment', 'completed'],
    },
    rejection_reason: {
      type: String,
      default: null,
    },
    inspection: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.ROOM_INSPECTION,
      default: null,
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
  },
  {
    timestamps: true,
  }
);

CheckoutRequestSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const CheckoutRequest = mongoose.model(DBCollections.CHECKOUT_REQUEST, CheckoutRequestSchema);

module.exports = CheckoutRequest;
