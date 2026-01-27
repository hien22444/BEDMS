const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const SystemConfigSchema = new mongoose.Schema({
  config_key: {
    type: String,
    required: true,
    unique: true,
  },
  config_value: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  value_type: {
    type: String,
    default: "string",
    enum: ["string", "number", "boolean", "json"],
  },
  updated_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

SystemConfigSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const SystemConfig = mongoose.model(
  DBCollections.SYSTEM_CONFIG,
  SystemConfigSchema
);

module.exports = SystemConfig;
