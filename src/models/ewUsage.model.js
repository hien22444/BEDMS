const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const { ObjectId } = mongoose.Schema.Types;

const EWUsageSchema = new mongoose.Schema(
  {
    block: {
      type: ObjectId,
      required: true,
      ref: DBCollections.BLOCK,
    },
    dorm: {
      type: ObjectId,
      required: true,
      ref: DBCollections.DORM,
    },
    block_name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['electric', 'water'],
      required: true,
    },
    meter_left: {
      type: Number,
      required: true,
      min: 0,
    },
    meter_right: {
      type: Number,
      default: 0,
      min: 0,
    },
    consumption: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    term: {
      type: String,
      required: true,
    },
    unit: {
      type: String,
      default: 'kW',
    },
    amount: {
      type: Number,
      default: 0,
    },
    price_per_unit: {
      type: Number,
      default: 3000,
    },
    occupied_beds: {
      type: Number,
      default: 0,
    },
    amount_per_bed: {
      type: Number,
      default: 0,
    },
    is_billed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

EWUsageSchema.pre('save', function (next) {
  // Set price_per_unit based on type if it is not already correct
  if (this.isNew || this.isModified('type')) {
    this.price_per_unit = this.type === 'water' ? 9000 : 3000;
  }
  // Calculate amount if it has not been set yet
  if (this.consumption > 0 && this.amount === 0) {
    this.amount = this.consumption * this.price_per_unit;
  }
  next();
});

EWUsageSchema.index({ block: 1, type: 1, date: 1 });

EWUsageSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const EWUsage = mongoose.model(DBCollections.EW_USAGE, EWUsageSchema);
module.exports = EWUsage;
