const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const InvoiceLineItemSchema = new mongoose.Schema({
  invoice: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.INVOICE,
  },
  item_type: {
    type: String,
    required: true,
    enum: ['room_fee', 'electricity', 'water', 'service', 'other'],
  },
  description: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  unit_price: {
    type: Number,
    required: true,
  },
  amount: {
    type: Number,
  },
});

InvoiceLineItemSchema.pre('save', function (next) {
  this.amount = this.quantity * this.unit_price;
  next();
});

InvoiceLineItemSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const InvoiceLineItem = mongoose.model(DBCollections.INVOICE_LINE_ITEM, InvoiceLineItemSchema);

module.exports = InvoiceLineItem;
