const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const BehavioralScoreHistorySchema = new mongoose.Schema({
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  change_type: {
    type: String,
    required: true,
    enum: ['penalty', 'reward', 'auto_increment'],
  },
  points_changed: {
    type: Number,
    required: true,
  },
  score_before: {
    type: Number,
    required: true,
  },
  score_after: {
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
  created_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

BehavioralScoreHistorySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const BehavioralScoreHistory = mongoose.model(
  DBCollections.BEHAVIORAL_SCORE_HISTORY,
  BehavioralScoreHistorySchema
);

module.exports = BehavioralScoreHistory;
