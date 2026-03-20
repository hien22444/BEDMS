const { status } = require('http-status');
const { otherRequestService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const createOtherRequest = catchAsync(async (req, res) => {
  const data = await otherRequestService.createOtherRequest(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const getMyOtherRequests = catchAsync(async (req, res) => {
  const data = await otherRequestService.getMyOtherRequests(req.user.id);
  res.success(data, status.OK);
});

const getAllOtherRequests = catchAsync(async (req, res) => {
  const data = await otherRequestService.getAllOtherRequests(req.query);
  res.success(data, status.OK);
});

const reviewOtherRequest = catchAsync(async (req, res) => {
  const data = await otherRequestService.reviewOtherRequest(req.params.id, req.user.id, req.body);
  res.success(data, status.OK);
});

module.exports = {
  createOtherRequest,
  getMyOtherRequests,
  getAllOtherRequests,
  reviewOtherRequest,
};
