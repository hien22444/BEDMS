const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const RoomSchema = new mongoose.Schema(
  {
    block: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.BLOCK,
    },
    room_number: {
      type: String,
      required: true,
    },
    floor: {
      type: Number,
      required: true,
    },
    room_type: {
      type: String,
      required: true,
      enum: ["2_person", "4_person", "6_person", "8_person"],
    },
    total_beds: {
      type: Number,
      required: true,
    },
    available_beds: {
      type: Number,
      required: true,
    },
    price_per_semester: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      default: "available",
      enum: ["available", "full", "maintenance", "inactive"],
    },
    has_ac: {
      type: Boolean,
      default: false,
    },
    has_water_heater: {
      type: Boolean,
      default: false,
    },
    has_private_bathroom: {
      type: Boolean,
      default: false,
    },
    area_sqm: {
      type: Number,
    },
    description: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

RoomSchema.index({ block: 1, room_number: 1 }, { unique: true });

RoomSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Room = mongoose.model(DBCollections.ROOM, RoomSchema);

module.exports = Room;
