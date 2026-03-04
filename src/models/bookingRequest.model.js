const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

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
      default: "pending",
      enum: ["pending", "approved", "rejected", "cancelled"],
    },
    rejection_reason: {
      type: String,
    },
    documents_url: {
      type: [String],
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

BookingRequestSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const BookingRequest = mongoose.model(
  DBCollections.BOOKING_REQUEST,
  BookingRequestSchema
);

module.exports = BookingRequest;
