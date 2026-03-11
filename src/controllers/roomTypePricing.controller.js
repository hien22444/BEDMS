const httpStatus = require('http-status');
const { roomTypePricingService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getRoomTypePricing = catchAsync(async (req, res) => {
  const data = await roomTypePricingService.getRoomTypePricing();
  res.success(data, httpStatus.OK);
});

const updateRoomTypePricing = catchAsync(async (req, res) => {
  const data = await roomTypePricingService.updateRoomTypePricing(req.body);
  res.success(data, httpStatus.OK);
});

module.exports = {
  getRoomTypePricing,
  updateRoomTypePricing,
};
