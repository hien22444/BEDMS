const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.USER,
    },
    laptop: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.LAPTOP,
    },
    quantity: {
      type: Number,
      required: true,
    },
    orderDate: {
      type: Date,
      default() {
        return new Date();
      },
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Order = mongoose.model(DBCollections.ORDER, OrderSchema);

module.exports = Order;
