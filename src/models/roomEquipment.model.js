const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const RoomEquipmentSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.ROOM,
    },
    template: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.EQUIPMENT_TEMPLATE,
    },
    equipment_code: {
      type: String,
      required: true,
      unique: true,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      default: 'good',
      enum: ['good', 'normal', 'damaged', 'broken', 'missing'],
    },
    condition_notes: {
      type: String,
    },
    purchase_date: {
      type: Date,
    },
    warranty_expiry: {
      type: Date,
    },
    last_maintenance_date: {
      type: Date,
    },
    next_maintenance_date: {
      type: Date,
    },
    assigned_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

RoomEquipmentSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const RoomEquipment = mongoose.model(DBCollections.ROOM_EQUIPMENT, RoomEquipmentSchema);

module.exports = RoomEquipment;
