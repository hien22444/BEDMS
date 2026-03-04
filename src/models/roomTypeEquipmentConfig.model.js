const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const RoomTypeEquipmentConfigSchema = new mongoose.Schema({
  room_type: {
    type: String,
    required: true,
  },
  template: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.EQUIPMENT_TEMPLATE,
  },
  standard_quantity: {
    type: Number,
    required: true,
  },
  is_mandatory: {
    type: Boolean,
    default: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

RoomTypeEquipmentConfigSchema.index(
  { room_type: 1, template: 1 },
  { unique: true }
);

RoomTypeEquipmentConfigSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const RoomTypeEquipmentConfig = mongoose.model(
  DBCollections.ROOM_TYPE_EQUIPMENT_CONFIG,
  RoomTypeEquipmentConfigSchema
);

module.exports = RoomTypeEquipmentConfig;
