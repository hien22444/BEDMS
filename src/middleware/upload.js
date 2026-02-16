const multer = require("multer");

const storage = multer.memoryStorage();

const excelFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only Excel files are accepted (.xlsx, .xls)"), false);
  }
};

const uploadExcel = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: excelFilter,
}).single("file");

module.exports = { uploadExcel };
