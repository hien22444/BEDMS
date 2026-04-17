const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const PricingConfigSchema = new mongoose.Schema({
  config_type: {
    type: String,
    required: true,
    enum: ['electricity', 'water', 'service_fee', 'late_payment_fee'],
  },
  price_per_unit: {
    type: Number,
    required: true,
  },
  unit: {
    type: String,
    required: true,
  },
  effective_from: {
    type: Date,
    required: true,
  },
  effective_to: {
    type: Date,
    default: null,
  },
  is_active: {
    type: Boolean,
    default: true,
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

PricingConfigSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const PricingConfig = mongoose.model(DBCollections.PRICING_CONFIG, PricingConfigSchema);

module.exports = PricingConfig;
