const crypto = require('crypto');
const path = require('path');
const AppError = require('../utils/AppError');
const { DormRuleFile } = require('../models');
const { cloudinary, uploadBuffer } = require('../config/cloudinary');

const MAX_DORM_RULE_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_DORM_RULE_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_DORM_RULE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

const normalizeName = (value = '') =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'dorm-rule';

const getFileExtension = (filename = '') => {
  return path.extname(filename || '').toLowerCase();
};

const getExtensionFromMime = (mimeType = '') => {
  const normalized = String(mimeType || '').toLowerCase();

  if (normalized === 'application/pdf') return '.pdf';
  if (normalized === 'application/msword') return '.doc';
  if (normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return '.docx';
  }

  return '';
};

const isAllowedDormRuleFile = (file) => {
  if (!file) return false;

  const extension = getFileExtension(file.originalname);
  const mimeType = String(file.mimetype || '').toLowerCase();

  return ALLOWED_DORM_RULE_EXTENSIONS.has(extension) || ALLOWED_DORM_RULE_MIMES.has(mimeType);
};

const validateDormRuleFile = (file) => {
  if (!file) {
    throw new AppError('Dorm rule file is required', 400);
  }

  if (!isAllowedDormRuleFile(file)) {
    throw new AppError('Only PDF, DOC, and DOCX files are accepted', 400);
  }

  if (typeof file.size === 'number' && file.size > MAX_DORM_RULE_FILE_SIZE) {
    throw new AppError('Dorm rule file must be 20MB or smaller', 400);
  }
};

const buildPublicId = (originalName = '', mimeType = '') => {
  const extension = getFileExtension(originalName) || getExtensionFromMime(mimeType) || '.bin';
  const baseName = normalizeName(path.basename(originalName, path.extname(originalName)));
  return `${Date.now()}-${crypto.randomUUID()}-${baseName}${extension}`;
};

const listDormRuleFiles = async () => {
  return DormRuleFile.find().sort({ is_featured: -1, createdAt: -1 });
};

const uploadDormRuleFile = async (adminId, file) => {
  validateDormRuleFile(file);

  const extension = (
    getFileExtension(file.originalname) ||
    getExtensionFromMime(file.mimetype) ||
    '.bin'
  ).replace('.', '');
  const publicId = buildPublicId(file.originalname, file.mimetype);
  let uploaded;

  try {
    uploaded = await uploadBuffer(file.buffer, {
      folder: 'dms/dorm-rules',
      resource_type: 'raw',
      public_id: publicId,
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    });
  } catch (error) {
    throw new AppError(error.message || 'Failed to upload dorm rule file', 500);
  }

  const payload = {
    original_name: file.originalname,
    file_extension: extension,
    file_url: uploaded.secure_url,
    cloudinary_public_id: uploaded.public_id || publicId,
    mime_type: file.mimetype || 'application/octet-stream',
    file_size: uploaded.bytes ?? file.size ?? 0,
    is_featured: true,
    uploaded_by: adminId,
  };

  let created;
  try {
    created = await DormRuleFile.create(payload);
    await DormRuleFile.updateMany({ _id: { $ne: created._id } }, { $set: { is_featured: false } });
    return created;
  } catch (error) {
    if (created?._id) {
      await DormRuleFile.findByIdAndDelete(created._id).catch(() => {});
    }
    await cloudinary.uploader
      .destroy(uploaded.public_id || publicId, { resource_type: 'raw' })
      .catch(() => {});
    throw error;
  }
};

const setDormRuleFileFeatured = async (id) => {
  const file = await DormRuleFile.findById(id);
  if (!file) {
    throw new AppError('Dorm rule file not found', 404);
  }

  await DormRuleFile.updateMany({ _id: { $ne: id } }, { $set: { is_featured: false } });
  const updated = await DormRuleFile.findByIdAndUpdate(id, { is_featured: true }, { new: true });

  if (!updated) {
    throw new AppError('Dorm rule file not found', 404);
  }

  return updated;
};

const deleteDormRuleFile = async (id) => {
  const file = await DormRuleFile.findById(id);
  if (!file) {
    throw new AppError('Dorm rule file not found', 404);
  }

  await DormRuleFile.findByIdAndDelete(id);

  if (file.is_featured) {
    const nextFeatured = await DormRuleFile.findOne().sort({ createdAt: -1 });
    if (nextFeatured) {
      await DormRuleFile.updateMany({}, { $set: { is_featured: false } });
      await DormRuleFile.findByIdAndUpdate(nextFeatured._id, { is_featured: true });
    }
  }

  await cloudinary.uploader
    .destroy(file.cloudinary_public_id, { resource_type: 'raw' })
    .catch(() => {});

  return { message: 'Dorm rule file deleted successfully' };
};

module.exports = {
  MAX_DORM_RULE_FILE_SIZE,
  listDormRuleFiles,
  uploadDormRuleFile,
  setDormRuleFileFeatured,
  deleteDormRuleFile,
};
