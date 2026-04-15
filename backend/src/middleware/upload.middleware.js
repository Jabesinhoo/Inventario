const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const isExcel =
    file.mimetype ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.originalname.toLowerCase().endsWith('.xlsx');

  if (!isExcel) {
    return cb(new Error('Solo se permiten archivos .xlsx'));
  }

  cb(null, true);
};

const uploadExcel = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

module.exports = {
  uploadExcel
};