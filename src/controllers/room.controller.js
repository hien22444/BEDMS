const { status } = require('http-status');
const { roomService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getAllRooms = catchAsync(async (req, res) => {
  const data = await roomService.getAllRooms(req.query);

  res.success(data, status.OK);
});

const getRoomById = catchAsync(async (req, res) => {
  const data = await roomService.getRoomById(req.params.id);

  res.success(data, status.OK);
});

const createRoom = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await roomService.createRoom(req.body, io);

  res.success(data, status.CREATED);
});

const updateRoom = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await roomService.updateRoom(req.params.id, req.body, io);

  res.success(data, status.OK);
});

const deleteRoom = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await roomService.deleteRoom(req.params.id, io);

  res.success(data, status.OK);
});

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};
