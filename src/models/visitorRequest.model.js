const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const VisitorRequestSchema = new mongoose.Schema({
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
  visit_date: {
    type: Date,
    required: true,
  },
  visit_time_from: {
    type: String,
    required: true,
  },
  visit_time_to: {
    type: String,
    required: true,
  },
  number_of_visitors: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  purpose: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: "pending",
    enum: ["pending", "approved", "rejected", "completed", "cancelled"],
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

VisitorRequestSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const VisitorRequest = mongoose.model(
  DBCollections.VISITOR_REQUEST,
  VisitorRequestSchema
);

module.exports = VisitorRequest;
