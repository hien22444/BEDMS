const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const BedTransferHistorySchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.STUDENT,
    },
    /** Semester snapshot when the bed transfer happened (for quota/reporting). */
    semester: {
      type: String,
      default: null,
    },
    from_room: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.ROOM,
    },
    from_bed: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.BED,
    },
    to_room: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.ROOM,
    },
    to_bed: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.BED,
    },
    transfer_source: {
      type: String,
      required: true,
      enum: ['manual_assignment', 'transfer_request_empty', 'transfer_request_swap'],
    },
    transfer_request: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.ROOM_TRANSFER_REQUEST,
      default: null,
    },
    changed_by_staff: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STAFF,
      default: null,
    },
    note: {
      type: String,
      default: null,
    },
    changed_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

BedTransferHistorySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const BedTransferHistory = mongoose.model(DBCollections.BED_TRANSFER_HISTORY, BedTransferHistorySchema);

module.exports = BedTransferHistory;
