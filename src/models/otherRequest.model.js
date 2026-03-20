const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const OtherRequestSchema = new mongoose.Schema(
  {
    request_code: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.USER,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'in_review', 'resolved', 'rejected'],
    },
    rejection_reason: {
      type: String,
      default: null,
    },
    manager_response: {
      type: String,
      default: null,
      trim: true,
      maxlength: 3000,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    reviewed_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.USER,
      default: null,
    },
  },
  { timestamps: true }
);

OtherRequestSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const OtherRequest = mongoose.model(DBCollections.OTHER_REQUEST, OtherRequestSchema);

module.exports = OtherRequest;
