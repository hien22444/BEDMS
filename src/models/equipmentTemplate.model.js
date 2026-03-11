const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const EquipmentTemplateSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.EQUIPMENT_CATEGORY,
    },
    equipment_name: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
    },
    model: {
      type: String,
    },
    specifications: {
      type: String,
    },
    estimated_lifespan_years: {
      type: Number,
    },
    unit_price: {
      type: Number,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

EquipmentTemplateSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const EquipmentTemplate = mongoose.model(DBCollections.EQUIPMENT_TEMPLATE, EquipmentTemplateSchema);

module.exports = EquipmentTemplate;
