const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const VisitorSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.VISITOR_REQUEST,
    },
    full_name: {
      type: String,
      required: true,
    },
    citizen_id: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    relationship: {
      type: String,
      required: true,
      enum: ['parent', 'sibling', 'friend', 'other'],
    },
    relationship_other: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

VisitorSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Visitor = mongoose.model(DBCollections.VISITOR, VisitorSchema);

module.exports = Visitor;
