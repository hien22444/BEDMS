const { status } = require('http-status');
const { dateConfigService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getDateConfig = catchAsync(async (req, res) => {
  const data = await dateConfigService.getDateConfig();
  res.success(data, status.OK);
});

const updateDateConfig = catchAsync(async (req, res) => {
  const data = await dateConfigService.updateDateConfig(req.user.id, req.body);
  res.success(data, status.OK);
});

module.exports = { getDateConfig, updateDateConfig };
