const { status } = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { aiRulesService } = require('../services');

const queryRules = catchAsync(async (req, res) => {
  const data = await aiRulesService.queryRules(req.body?.question);
  res.success(data, status.OK);
});

const getAllRules = catchAsync(async (_req, res) => {
  const data = await aiRulesService.getAllRules();
  res.success(data, status.OK);
});

module.exports = {
  queryRules,
  getAllRules,
};
