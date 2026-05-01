const { status } = require('http-status');
const { contractExtensionService } = require('../services');
const catchAsync = require('../utils/catchAsync');

// ── Student ──────────────────────────────────────────────────────────────────

const createExtensionRequest = catchAsync(async (req, res) => {
  const data = await contractExtensionService.createExtensionRequest(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const getMyExtensionRequests = catchAsync(async (req, res) => {
  const data = await contractExtensionService.getMyExtensionRequests(req.user.id);
  res.success(data, status.OK);
});

const cancelExtensionRequest = catchAsync(async (req, res) => {
  const data = await contractExtensionService.cancelExtensionRequest(req.user.id, req.params.id);
  res.success(data, status.OK);
});

// ── Manager ──────────────────────────────────────────────────────────────────

const getAllExtensionRequests = catchAsync(async (req, res) => {
  const data = await contractExtensionService.getAllExtensionRequests(req.query);
  res.success(data, status.OK);
});

const getExtensionRequestById = catchAsync(async (req, res) => {
  const data = await contractExtensionService.getExtensionRequestById(req.params.id);
  res.success(data, status.OK);
});

const reviewExtensionRequest = catchAsync(async (req, res) => {
  const data = await contractExtensionService.reviewExtensionRequest(
    req.params.id,
    req.user.id,
    req.body
  );
  res.success(data, status.OK);
});

const getExtensionStats = catchAsync(async (req, res) => {
  const data = await contractExtensionService.getExtensionStats();
  res.success(data, status.OK);
});

module.exports = {
  createExtensionRequest,
  getMyExtensionRequests,
  cancelExtensionRequest,
  getAllExtensionRequests,
  getExtensionRequestById,
  reviewExtensionRequest,
  getExtensionStats,
};
