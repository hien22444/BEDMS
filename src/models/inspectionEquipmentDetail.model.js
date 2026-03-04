const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const InspectionEquipmentDetailSchema = new mongoose.Schema({
  inspection: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM_INSPECTION,
  },
  equipment: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM_EQUIPMENT,
  },
  status_at_inspection: {
    type: String,
    required: true,
    enum: ["good", "normal", "damaged", "broken", "missing"],
  },
  notes: {
    type: String,
  },
  photo_url: {
    type: String,
  },
});

InspectionEquipmentDetailSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const InspectionEquipmentDetail = mongoose.model(
  DBCollections.INSPECTION_EQUIPMENT_DETAIL,
  InspectionEquipmentDetailSchema
);

module.exports = InspectionEquipmentDetail;
