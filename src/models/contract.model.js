const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const ContractSchema = new mongoose.Schema(
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
      required: true,
      ref: DBCollections.BED,
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
    room_price: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'expired', 'terminated', 'extended'],
    },
    contract_url: {
      type: String,
    },
    signed_at: {
      type: Date,
      default: null,
    },
    created_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STAFF,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ContractSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Contract = mongoose.model(DBCollections.CONTRACT, ContractSchema);

module.exports = Contract;
