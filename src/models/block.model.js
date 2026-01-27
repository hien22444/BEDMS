const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const BlockSchema = new mongoose.Schema(
  {
    dorm: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.DORM,
    },
    block_name: {
      type: String,
      required: true,
    },
    block_code: {
      type: String,
      required: true,
    },
    floor_count: {
      type: Number,
    },
    total_rooms: {
      type: Number,
    },
    gender_type: {
      type: String,
      required: true,
      enum: ["male", "female", "mixed"],
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

BlockSchema.index({ dorm: 1, block_code: 1 }, { unique: true });

BlockSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Block = mongoose.model(DBCollections.BLOCK, BlockSchema);

module.exports = Block;
