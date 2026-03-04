const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const ContractExtensionSchema = new mongoose.Schema({
  contract: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.CONTRACT,
  },
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  new_end_date: {
    type: Date,
    required: true,
  },
  extension_months: {
    type: Number,
    required: true,
  },
  additional_cost: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    default: "pending",
    enum: ["pending", "approved", "rejected"],
  },
  requested_at: {
    type: Date,
    default: Date.now,
  },
  reviewed_at: {
    type: Date,
    default: null,
  },
  reviewed_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
});

ContractExtensionSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const ContractExtension = mongoose.model(
  DBCollections.CONTRACT_EXTENSION,
  ContractExtensionSchema
);

module.exports = ContractExtension;
