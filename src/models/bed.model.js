const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const BedSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.ROOM,
    },
    bed_number: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: "available",
      enum: ["available", "occupied", "maintenance", "reserved"],
    },
  },
  {
    timestamps: true,
  }
);

BedSchema.index({ room: 1, bed_number: 1 }, { unique: true });

BedSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Bed = mongoose.model(DBCollections.BED, BedSchema);

module.exports = Bed;
