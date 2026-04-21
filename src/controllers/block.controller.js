const { status } = require('http-status');
const { blockService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getAllBlocks = catchAsync(async (req, res) => {
  const data = await blockService.getAllBlocks(req.query);

  res.success(data, status.OK);
});

const getBlockById = catchAsync(async (req, res) => {
  const data = await blockService.getBlockById(req.params.id);

  res.success(data, status.OK);
});

const createBlock = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await blockService.createBlock(req.body, io);

  res.success(data, status.CREATED);
});

const updateBlock = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await blockService.updateBlock(req.params.id, req.body, io);

  res.success(data, status.OK);
});

const deleteBlock = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await blockService.deleteBlock(req.params.id, io);

  res.success(data, status.OK);
});

module.exports = {
  getAllBlocks,
  getBlockById,
  createBlock,
  updateBlock,
  deleteBlock,
};
