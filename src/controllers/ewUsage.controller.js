const { status } = require('http-status');
const { ewUsageService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getEWUsages = catchAsync(async (req, res) => {
  const data = await ewUsageService.getEWUsages(req.query);
  res.success(data, status.OK);
});

const createEWUsage = catchAsync(async (req, res) => {
  const data = await ewUsageService.createEWUsage(req.body);
  res.success(data, status.CREATED);
});

const updateEWUsage = catchAsync(async (req, res) => {
  const data = await ewUsageService.updateEWUsage(req.params.id, req.body);
  res.success(data, status.OK);
});

const resetMeter = catchAsync(async (req, res) => {
  const data = await ewUsageService.resetMeter(req.params.id);
  res.success(data, status.OK);
});

const importEWUsages = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const result = await ewUsageService.importEWUsages(req.file.buffer);
  res.success(result, status.OK);
});

const exportEWUsages = catchAsync(async (req, res) => {
  const buffer = await ewUsageService.exportEWUsages(req.query);
  res.setHeader('Content-Disposition', 'attachment; filename=ew-usages.xlsx');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.send(buffer);
});

const recalculate = catchAsync(async (req, res) => {
  const result = await ewUsageService.recalculate();
  res.success(result, status.OK);
});

const getMyEWUsages = catchAsync(async (req, res) => {
  const data = await ewUsageService.getMyEWUsages(req.user.id);
  res.success(data, status.OK);
});

module.exports = {
  getMyEWUsages,
  getEWUsages,
  createEWUsage,
  updateEWUsage,
  resetMeter,
  importEWUsages,
  exportEWUsages,
  recalculate,
};
