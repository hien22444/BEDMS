const svc = require('../services/email-campaign.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { cloudinary } = require('../config/cloudinary');

exports.previewStudents = catchAsync(async (req, res) => {
  const result = await svc.previewStudents(req.query);
  res.json(result);
});

exports.getFilterOptions = catchAsync(async (req, res) => {
  const result = await svc.getFilterOptions();
  res.json(result);
});

exports.sendCampaign = catchAsync(async (req, res) => {
  const { subject, body, filters, extra_emails } = req.body;
  const result = await svc.sendCampaign({
    subject, body, filters, extra_emails, userId: req.user.id,
  });
  res.json(result);
});

exports.uploadInlineImage = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Image file is required', 400);
  const b64 = req.file.buffer.toString('base64');
  const mime = req.file.mimetype || 'image/png';
  const dataUri = `data:${mime};base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'dms/email-inline',
    resource_type: 'image',
  });
  res.json({ url: result.secure_url });
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
