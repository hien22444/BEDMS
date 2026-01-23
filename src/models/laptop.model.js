const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const LaptopSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    stockQuantity: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

LaptopSchema.set('toJSON', {
  virtuals: true, //replace _id
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Laptop = mongoose.model(DBCollections.LAPTOP, LaptopSchema);

module.exports = Laptop;
