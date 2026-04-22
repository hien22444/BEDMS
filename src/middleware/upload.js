const path = require('path');
const multer = require('multer');

const storage = multer.memoryStorage();

const excelFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel files are accepted (.xlsx, .xls)'), false);
  }
};

const uploadExcel = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: excelFilter,
}).single('file');

const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are accepted (JPEG, PNG, WebP)'), false);
  }
};

const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
}).single('image');

const dormRuleFileFilter = (req, file, cb) => {
  const allowedMimes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ]);

  const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (allowedMimes.has(file.mimetype) || allowedExtensions.has(extension)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, and DOCX files are accepted'), false);
  }
};

const uploadDormRuleDocument = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: dormRuleFileFilter,
}).single('file');

module.exports = { uploadExcel, uploadImage, uploadDormRuleDocument };
