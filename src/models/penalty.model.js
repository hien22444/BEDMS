const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const PenaltySchema = new mongoose.Schema({
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  report: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.VIOLATION_REPORT,
    default: null,
  },
  penalty_type: {
    type: String,
    required: true,
    enum: ['severe', 'minor'],
  },
  points_deducted: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  semester: {
    type: String,
    required: true,
  },
  issued_by: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STAFF,
  },
  issued_at: {
    type: Date,
    default: Date.now,
  },
});

PenaltySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Penalty = mongoose.model(DBCollections.PENALTY, PenaltySchema);

module.exports = Penalty;
