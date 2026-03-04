const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const EquipmentHistorySchema = new mongoose.Schema({
  equipment: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM_EQUIPMENT,
  },
  action_type: {
    type: String,
    required: true,
    enum: ["added", "removed", "repaired", "replaced", "status_changed", "moved"],
  },
  old_status: {
    type: String,
  },
  new_status: {
    type: String,
  },
  old_room: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.ROOM,
    default: null,
  },
  new_room: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.ROOM,
    default: null,
  },
  notes: {
    type: String,
  },
  performed_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  performed_at: {
    type: Date,
    default: Date.now,
  },
});

EquipmentHistorySchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const EquipmentHistory = mongoose.model(
  DBCollections.EQUIPMENT_HISTORY,
  EquipmentHistorySchema
);

module.exports = EquipmentHistory;
