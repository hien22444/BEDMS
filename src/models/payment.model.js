const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const PaymentSchema = new mongoose.Schema({
  transaction_code: {
    type: String,
    required: true,
    unique: true,
  },
  invoice: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.INVOICE,
  },
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  amount: {
    type: Number,
    required: true,
  },
  payment_method: {
    type: String,
    required: true,
    enum: ["vnpay", "momo", "bank_transfer", "cash"],
  },
  payment_status: {
    type: String,
    default: "pending",
    enum: ["pending", "completed", "failed", "refunded"],
  },
  transaction_details: {
    type: mongoose.Schema.Types.Mixed,
  },
  paid_at: {
    type: Date,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

PaymentSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Payment = mongoose.model(DBCollections.PAYMENT, PaymentSchema);

module.exports = Payment;
