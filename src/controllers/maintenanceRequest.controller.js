const { status } = require('http-status');
const { maintenanceRequestService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const createMaintenanceRequest = catchAsync(async (req, res) => {
  const data = await maintenanceRequestService.createMaintenanceRequest(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const getMyMaintenanceRequests = catchAsync(async (req, res) => {
  const data = await maintenanceRequestService.getMyMaintenanceRequests(req.user.id);
  res.success(data, status.OK);
});

const getMyRoomEquipment = catchAsync(async (req, res) => {
  const data = await maintenanceRequestService.getMyRoomEquipment(req.user.id);
  res.success(data, status.OK);
});

const getMyMaintenanceContext = catchAsync(async (req, res) => {
  const data = await maintenanceRequestService.getMyMaintenanceContext(req.user.id);
  res.success(data, status.OK);
});

const getAllMaintenanceRequests = catchAsync(async (req, res) => {
  const data = await maintenanceRequestService.getAllMaintenanceRequests(req.query);
  res.success(data, status.OK);
});

const reviewMaintenanceRequest = catchAsync(async (req, res) => {
  const data = await maintenanceRequestService.reviewMaintenanceRequest(
    req.params.id,
    req.user.id,
    req.body
  );
  res.success(data, status.OK);
});

module.exports = {
  createMaintenanceRequest,
  getMyRoomEquipment,
  getMyMaintenanceContext,
  getMyMaintenanceRequests,
  getAllMaintenanceRequests,
  reviewMaintenanceRequest,
};
