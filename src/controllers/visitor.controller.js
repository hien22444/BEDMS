const { status } = require("http-status");
const { visitorService } = require("../services");
const catchAsync = require("../utils/catchAsync");

// ─── Student endpoints ───

const createVisitorRequest = catchAsync(async (req, res) => {
  const data = await visitorService.createVisitorRequest(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const getMyVisitorRequests = catchAsync(async (req, res) => {
  const data = await visitorService.getMyVisitorRequests(req.user.id);
  res.success(data, status.OK);
});

const cancelVisitorRequest = catchAsync(async (req, res) => {
  const data = await visitorService.cancelVisitorRequest(
    req.params.id,
    req.user.id
  );
  res.success(data, status.OK);
});

// ─── Security endpoints ───

const getAllVisitorRequests = catchAsync(async (req, res) => {
  const data = await visitorService.getAllVisitorRequests(req.query);
  res.success(data, status.OK);
});

const getVisitorRequestDetail = catchAsync(async (req, res) => {
  const data = await visitorService.getVisitorRequestDetail(req.params.id);
  res.success(data, status.OK);
});

const approveVisitorRequest = catchAsync(async (req, res) => {
  const data = await visitorService.approveVisitorRequest(
    req.params.id,
    req.user.id
  );
  res.success(data, status.OK);
});

const rejectVisitorRequest = catchAsync(async (req, res) => {
  const data = await visitorService.rejectVisitorRequest(
    req.params.id,
    req.user.id,
    req.body.reason
  );
  res.success(data, status.OK);
});

const completeVisitorRequest = catchAsync(async (req, res) => {
  const data = await visitorService.completeVisitorRequest(
    req.params.id,
    req.user.id
  );
  res.success(data, status.OK);
});

const checkinVisitor = catchAsync(async (req, res) => {
  const data = await visitorService.checkinVisitor(
    req.params.id,
    req.body.visitorId,
    req.user.id
  );
  res.success(data, status.OK);
});

const checkoutVisitor = catchAsync(async (req, res) => {
  const data = await visitorService.checkoutVisitor(
    req.params.checkinId,
    req.user.id
  );
  res.success(data, status.OK);
});

const getActiveVisitors = catchAsync(async (req, res) => {
  const data = await visitorService.getActiveVisitors();
  res.success(data, status.OK);
});

module.exports = {
  createVisitorRequest,
  getMyVisitorRequests,
  cancelVisitorRequest,
  getAllVisitorRequests,
  getVisitorRequestDetail,
  approveVisitorRequest,
  rejectVisitorRequest,
  completeVisitorRequest,
  checkinVisitor,
  checkoutVisitor,
  getActiveVisitors,
};
