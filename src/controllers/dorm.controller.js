const httpStatus = require("http-status");
const { dormService } = require("../services");
const catchAsync = require("../utils/catchAsync");

/**
 * POST /v1/dorms
 */
const createDorm = catchAsync(async (req, res) => {
  const dorm = await dormService.createDorm(req.body);
  res.success(dorm, httpStatus.CREATED);
});

/**
 * GET /v1/dorms
 */
const getDorms = catchAsync(async (req, res) => {
  const data = await dormService.getDorms(req.query);
  res.success(data, httpStatus.OK);
});

/**
 * GET /v1/dorms/:id
 */
const getDormById = catchAsync(async (req, res) => {
  const dorm = await dormService.getDormById(req.params.id);
  res.success(dorm, httpStatus.OK);
});

/**
 * PATCH /v1/dorms/:id
 */
const updateDorm = catchAsync(async (req, res) => {
  const dorm = await dormService.updateDorm(req.params.id, req.body);
  res.success(dorm, httpStatus.OK);
});

/**
 * DELETE /v1/dorms/:id
 */
const deleteDorm = catchAsync(async (req, res) => {
  const result = await dormService.deleteDorm(req.params.id);
  res.success(result, httpStatus.OK);
});

module.exports = {
  createDorm,
  getDorms,
  getDormById,
  updateDorm,
  deleteDorm,
};

