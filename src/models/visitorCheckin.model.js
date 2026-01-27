const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const VisitorCheckinSchema = new mongoose.Schema({
  request: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.VISITOR_REQUEST,
  },
  visitor: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.VISITOR,
  },
  check_in_time: {
    type: Date,
    required: true,
  },
  check_out_time: {
    type: Date,
    default: null,
  },
  checked_in_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  checked_out_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  notes: {
    type: String,
  },
});

VisitorCheckinSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const VisitorCheckin = mongoose.model(
  DBCollections.VISITOR_CHECKIN,
  VisitorCheckinSchema
);

module.exports = VisitorCheckin;
