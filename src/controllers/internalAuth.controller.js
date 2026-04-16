const { status } = require('http-status');
const { internalAuthService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getJwks = catchAsync(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const data = internalAuthService.getFaceServiceJwks();
  res.success(data, status.OK);
});

module.exports = {
  getJwks,
};
