const { Order, Laptop } = require('../models');

const createOrder = async (body) => {
  const laptop = await Laptop.findById(body.laptop);

  if (!laptop) {
    throw new Error('Laptop not found');
  }

  const newStockQuantity = laptop.stockQuantity - body.quantity;

  if (newStockQuantity < 0) {
    throw new Error('Insufficient stock quantity available');
  }

  laptop.set({
    stockQuantity: newStockQuantity,
  });

  const [order] = await Promise.all([new Order(body).save(), laptop.save()]);

  return order;
};

const getAllOrders = async () => {
  const orders = await Order.find().populate([{ path: 'user' }, { path: 'laptop' }]);

  return orders;
};

const getAllOrdersByDate = async (start, end) => {
  const orders = await Order.find({
    orderDate: {
      $gte: start,
      $lte: end,
    },
  }).populate([{ path: 'user' }, { path: 'laptop' }]);

  return orders;
};

module.exports = {
  createOrder,
  getAllOrders,
  getAllOrdersByDate,
};
