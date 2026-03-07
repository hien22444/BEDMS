const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const PaymentSchema = new mongoose.Schema({
  transaction_code: {
    type: String,
    required: true,
    unique: true,
  },
  // PayOS orderCode (numeric) for querying status/cancel + webhook mapping
  payos_order_code: {
    type: Number,
    default: null,
    index: true,
  },
  payos_payment_link_id: {
    type: String,
    default: null,
  },
  payos_checkout_url: {
    type: String,
    default: null,
  },
  payos_qr_code: {
    type: String,
    default: null,
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
    enum: ["payos", "vnpay", "momo", "bank_transfer", "cash"],
  },
  payment_status: {
    type: String,
    default: "pending",
    enum: ["pending", "completed", "failed", "refunded", "cancelled", "expired"],
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
