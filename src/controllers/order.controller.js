const { status } = require("http-status");
const { orderService } = require("../services");
const catchAsync = require("../utils/catchAsync");

const createOrder = catchAsync(async (req, res) => {
  const data = await orderService.createOrder({
    ...req.body,
    laptop: req.body.laptopId,
    user: req.user._id,
  });

  res.success(data, status.CREATED);
});

const getAllOrder = catchAsync(async (req, res) => {
  const data = await orderService.getAllOrders();

  res.success(data, status.OK);
});

const getAllOrdersByDate = catchAsync(async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    throw new Error("Missing start or end date");
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new Error(
      "Invalid date range: start must be before end and both must be valid dates"
    );
  }

  const data = await orderService.getAllOrdersByDate(startDate, endDate);
  res.success(data, status.OK);
});

module.exports = {
  createOrder,
  getAllOrder,
  getAllOrdersByDate,
};
