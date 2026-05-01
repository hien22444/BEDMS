const { status } = require('http-status');
const { checkoutRequestService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const createCheckoutRequest = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await checkoutRequestService.createCheckoutRequest(req.user.id, req.body, io);
  res.success(data, status.CREATED);
});

const getMyCheckoutRequests = catchAsync(async (req, res) => {
  const data = await checkoutRequestService.getMyCheckoutRequests(req.user.id);
  res.success(data, status.OK);
});

const cancelCheckoutRequest = catchAsync(async (req, res) => {
  const data = await checkoutRequestService.cancelCheckoutRequest(req.user.id, req.params.id);
  res.success(data, status.OK);
});

const getAllCheckoutRequests = catchAsync(async (req, res) => {
  const data = await checkoutRequestService.getAllCheckoutRequests(req.query);
  res.success(data, status.OK);
});

const getCheckoutRequestById = catchAsync(async (req, res) => {
  const data = await checkoutRequestService.getCheckoutRequestById(req.params.id);
  res.success(data, status.OK);
});

const createCfdExpelRequest = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await checkoutRequestService.createCfdExpelRequest(
    req.user.id,
    req.body.student_code,
    io
  );
  res.success(data, status.CREATED);
});

const reviewCheckoutRequest = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await checkoutRequestService.reviewCheckoutRequest(
    req.params.id,
    req.user.id,
    req.body,
    io
  );
  res.success(data, status.OK);
});

const completeCheckoutRequest = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await checkoutRequestService.completeCheckoutRequest(req.params.id, req.user.id, req.body, io);
  res.success(data, status.OK);
});

const inspectCheckoutRequest = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await checkoutRequestService.inspectCheckoutRequest(
    req.params.id,
    req.user.id,
    req.body,
    io
  );
  res.success(data, status.OK);
});

const getApprovedCheckoutRequests = catchAsync(async (req, res) => {
  const data = await checkoutRequestService.getApprovedCheckoutRequests(req.query);
  res.success(data, status.OK);
});

const getCheckoutInspectionHistory = catchAsync(async (req, res) => {
  const data = await checkoutRequestService.getCheckoutInspectionHistory(req.query);
  res.success(data, status.OK);
});

module.exports = {
  createCheckoutRequest,
  getMyCheckoutRequests,
  cancelCheckoutRequest,
  getAllCheckoutRequests,
  getCheckoutRequestById,
  createCfdExpelRequest,
  reviewCheckoutRequest,
  completeCheckoutRequest,
  inspectCheckoutRequest,
  getApprovedCheckoutRequests,
  getCheckoutInspectionHistory,
};
