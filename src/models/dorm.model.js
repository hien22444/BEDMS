const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const DormSchema = new mongoose.Schema(
  {
    dorm_name: {
      type: String,
      required: true,
    },
    dorm_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    total_floors: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    total_blocks: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
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

DormSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Dorm = mongoose.model(DBCollections.DORM, DormSchema);

module.exports = Dorm;
