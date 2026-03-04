const httpStatus = require('http-status');
const equipmentService = require('../services/equipment.service');
const catchAsync = require('../utils/catchAsync');

// ==================== CATEGORY ====================

const createCategory = catchAsync(async (req, res) => {
  const category = await equipmentService.createCategory(req.body);
  res.success(category, httpStatus.CREATED);
});

const getCategories = catchAsync(async (req, res) => {
  const data = await equipmentService.getCategories(req.query);
  res.success(data, httpStatus.OK);
});

const getCategoryById = catchAsync(async (req, res) => {
  const category = await equipmentService.getCategoryById(req.params.id);
  res.success(category, httpStatus.OK);
});

const updateCategory = catchAsync(async (req, res) => {
  const category = await equipmentService.updateCategory(req.params.id, req.body);
  res.success(category, httpStatus.OK);
});

const deleteCategory = catchAsync(async (req, res) => {
  const result = await equipmentService.deleteCategory(req.params.id);
  res.success(result, httpStatus.OK);
});

// ==================== TEMPLATE ====================

const createTemplate = catchAsync(async (req, res) => {
  const template = await equipmentService.createTemplate(req.body);
  res.success(template, httpStatus.CREATED);
});

const getTemplates = catchAsync(async (req, res) => {
  const data = await equipmentService.getTemplates(req.query);
  res.success(data, httpStatus.OK);
});

const getTemplateById = catchAsync(async (req, res) => {
  const template = await equipmentService.getTemplateById(req.params.id);
  res.success(template, httpStatus.OK);
});

const updateTemplate = catchAsync(async (req, res) => {
  const template = await equipmentService.updateTemplate(req.params.id, req.body);
  res.success(template, httpStatus.OK);
});

const deleteTemplate = catchAsync(async (req, res) => {
  const result = await equipmentService.deleteTemplate(req.params.id);
  res.success(result, httpStatus.OK);
});

// ==================== ROOM EQUIPMENT ====================

const addRoomEquipment = catchAsync(async (req, res) => {
  const data = await equipmentService.addRoomEquipment(req.body);
  res.success(data, httpStatus.CREATED);
});

const getRoomEquipments = catchAsync(async (req, res) => {
  const data = await equipmentService.getRoomEquipments(req.query);
  res.success(data, httpStatus.OK);
});

const deleteRoomEquipment = catchAsync(async (req, res) => {
  const result = await equipmentService.deleteRoomEquipment(req.params.id);
  res.success(result, httpStatus.OK);
});

const updateRoomEquipment = catchAsync(async (req, res) => {
  const data = await equipmentService.updateRoomEquipment(req.params.id, req.body);
  res.success(data, httpStatus.OK);
});

// ==================== ROOM TYPE EQUIPMENT CONFIG ====================

const createRoomTypeConfig = catchAsync(async (req, res) => {
  const config = await equipmentService.createRoomTypeConfig(req.body);
  res.success(config, httpStatus.CREATED);
});

const getRoomTypeConfigs = catchAsync(async (req, res) => {
  const data = await equipmentService.getRoomTypeConfigs(req.query);
  res.success(data, httpStatus.OK);
});

const updateRoomTypeConfig = catchAsync(async (req, res) => {
  const config = await equipmentService.updateRoomTypeConfig(req.params.id, req.body);
  res.success(config, httpStatus.OK);
});

const deleteRoomTypeConfig = catchAsync(async (req, res) => {
  const result = await equipmentService.deleteRoomTypeConfig(req.params.id);
  res.success(result, httpStatus.OK);
});

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  addRoomEquipment,
  getRoomEquipments,
  updateRoomEquipment,
  deleteRoomEquipment,
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  createRoomTypeConfig,
  getRoomTypeConfigs,
  updateRoomTypeConfig,
  deleteRoomTypeConfig,
};
