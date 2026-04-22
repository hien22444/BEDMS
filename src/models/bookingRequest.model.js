const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const BookingRequestSchema = new mongoose.Schema(
  {
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
    bed: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.BED,
      default: null,
    },
    // Keep original booked bed immutable; store post-transfer bed here.
    bed_transfer: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.BED,
      default: null,
    },
    invoice: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.INVOICE,
      default: null,
    },
    semester: {
      type: String,
      required: true,
    },
    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      default: 'awaiting_payment',
      enum: ['awaiting_payment', 'approved', 'cancelled', 'expired'],
    },
    source: {
      type: String,
      enum: ['hold', 'new_booking'],
      default: 'new_booking',
    },
    note: {
      type: String,
      default: null,
    },
    expires_at: {
      type: Date,
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
    checkout_date: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

BookingRequestSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

// Convenience field for consumers: use transferred bed if present.
BookingRequestSchema.virtual('effective_bed').get(function getEffectiveBed() {
  return this.bed_transfer || this.bed || null;
});

const BookingRequest = mongoose.model(DBCollections.BOOKING_REQUEST, BookingRequestSchema);

module.exports = BookingRequest;
