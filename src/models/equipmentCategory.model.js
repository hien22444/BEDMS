const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const EquipmentCategorySchema = new mongoose.Schema({
  category_name: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

EquipmentCategorySchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const EquipmentCategory = mongoose.model(
  DBCollections.EQUIPMENT_CATEGORY,
  EquipmentCategorySchema
);

module.exports = EquipmentCategory;
