const { status } = require('http-status');
const { roomTransferService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const createEmptyBedTransferRequest = catchAsync(async (req, res) => {
  const data = await roomTransferService.createEmptyBedTransferRequest(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const createSwapTransferRequest = catchAsync(async (req, res) => {
  const data = await roomTransferService.createSwapTransferRequest(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const getSwapTargetPreview = catchAsync(async (req, res) => {
  const data = await roomTransferService.getSwapTargetPreview(req.user.id, req.query.student_code);
  res.success(data, status.OK);
});

const getMyTransferRequests = catchAsync(async (req, res) => {
  const data = await roomTransferService.getMyTransferRequests(req.user.id);
  res.success(data, status.OK);
});

const getMyTransferHistory = catchAsync(async (req, res) => {
  const data = await roomTransferService.getMyTransferHistory(req.user.id);
  res.success(data, status.OK);
});

const getAvailableBedsForTransfer = catchAsync(async (req, res) => {
  const data = await roomTransferService.getAvailableBedsForTransfer(req.user.id);
  res.success(data, status.OK);
});

const respondSwapTransferRequest = catchAsync(async (req, res) => {
  const data = await roomTransferService.respondSwapTransferRequest(req.user.id, req.params.id, req.body);
  res.success(data, status.OK);
});

const cancelTransferRequest = catchAsync(async (req, res) => {
  const data = await roomTransferService.cancelTransferRequest(req.user.id, req.params.id);
  res.success(data, status.OK);
});

const getAllTransferRequests = catchAsync(async (req, res) => {
  const data = await roomTransferService.getAllTransferRequests(req.query);
  res.success(data, status.OK);
});

const reviewTransferRequest = catchAsync(async (req, res) => {
  const data = await roomTransferService.reviewTransferRequest(req.params.id, req.user.id, req.body);
  res.success(data, status.OK);
});

const checkTransferSupplementPayment = catchAsync(async (req, res) => {
  const data = await roomTransferService.checkTransferSupplementPayment(req.params.id, req.user.id);
  res.success(data, status.OK);
});

const confirmRefundProcessed = catchAsync(async (req, res) => {
  const data = await roomTransferService.confirmRefundProcessed(req.params.id, req.user.id);
  res.success(data, status.OK);
});

module.exports = {
  createEmptyBedTransferRequest,
  createSwapTransferRequest,
  getSwapTargetPreview,
  getMyTransferRequests,
  getMyTransferHistory,
  getAvailableBedsForTransfer,
  respondSwapTransferRequest,
  cancelTransferRequest,
  getAllTransferRequests,
  reviewTransferRequest,
  checkTransferSupplementPayment,
  confirmRefundProcessed,
};
