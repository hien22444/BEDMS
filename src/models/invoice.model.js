const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const InvoiceSchema = new mongoose.Schema(
  {
    invoice_code: {
      type: String,
      required: true,
      unique: true,
    },
    student: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.STUDENT,
    },
    room: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.ROOM,
    },
    invoice_month: {
      type: String,
      required: true,
    },
    room_fee: {
      type: Number,
      required: true,
      default: 0,
    },
    electricity_fee: {
      type: Number,
      required: true,
      default: 0,
    },
    water_fee: {
      type: Number,
      required: true,
      default: 0,
    },
    service_fee: {
      type: Number,
      required: true,
      default: 0,
    },
    other_fees: {
      type: Number,
      default: 0,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    payment_status: {
      type: String,
      default: 'unpaid',
      enum: ['unpaid', 'paid', 'overdue', 'cancelled'],
    },
    due_date: {
      type: Date,
      required: true,
    },
    paid_at: {
      type: Date,
      default: null,
    },
    created_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STAFF,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

InvoiceSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Invoice = mongoose.model(DBCollections.INVOICE, InvoiceSchema);

module.exports = Invoice;
