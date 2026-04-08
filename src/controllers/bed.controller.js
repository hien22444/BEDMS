const httpStatus = require('http-status');
const bedService = require('../services/bed.service');
const catchAsync = require('../utils/catchAsync');

const getAllBeds = catchAsync(async (req, res) => {
  const data = await bedService.getAllBeds(req.query);
  res.success(data, httpStatus.OK);
});

const getBedsByRoom = catchAsync(async (req, res) => {
  const data = await bedService.getBedsByRoom(req.params.roomId);
  res.success(data, httpStatus.OK);
});

const getBedById = catchAsync(async (req, res) => {
  const data = await bedService.getBedById(req.params.id);
  res.success(data, httpStatus.OK);
});

const updateBedStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const data = await bedService.updateBedStatus(req.params.id, status);
  res.success(data, httpStatus.OK);
});

const changeBedAssignment = catchAsync(async (req, res) => {
  const { source_bed, target_bed } = req.body;
  const data = await bedService.changeBedAssignment(source_bed, target_bed, req.user.id);
  res.success(data, httpStatus.OK);
});

const getBedTransferHistory = catchAsync(async (req, res) => {
  const data = await bedService.getBedTransferHistory(req.query);
  res.success(data, httpStatus.OK);
});

module.exports = {
  getAllBeds,
  getBedsByRoom,
  getBedById,
  updateBedStatus,
  changeBedAssignment,
  getBedTransferHistory,
};
