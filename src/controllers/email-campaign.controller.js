const svc = require('../services/email-campaign.service');
const catchAsync = require('../utils/catchAsync');

exports.previewStudents = catchAsync(async (req, res) => {
  const result = await svc.previewStudents(req.query);
  res.json(result);
});

exports.sendCampaign = catchAsync(async (req, res) => {
  const { subject, body, filters } = req.body;
  const result = await svc.sendCampaign({ subject, body, filters, userId: req.user.id });
  res.json(result);
});

exports.listTemplates = catchAsync(async (req, res) => {
  const items = await svc.listTemplates();
  res.json({ items });
});

exports.createTemplate = catchAsync(async (req, res) => {
  const { name, subject, body } = req.body;
  const item = await svc.createTemplate({ name, subject, body, userId: req.user.id });
  res.status(201).json(item);
});

exports.updateTemplate = catchAsync(async (req, res) => {
  const item = await svc.updateTemplate(req.params.id, req.body);
  res.json(item);
});

exports.deleteTemplate = catchAsync(async (req, res) => {
  await svc.deleteTemplate(req.params.id);
  res.status(204).send();
});

exports.getHistory = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await svc.getHistory({ page: Number(page) || 1, limit: Number(limit) || 20 });
  res.json(result);
});
