const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('../../controllers/email-campaign.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

router.use(authenticate, authorize('manager'));

router.get('/students/preview', c.previewStudents);
router.get('/filter-options', c.getFilterOptions);
router.post('/send', c.sendCampaign);
router.post('/upload-image', upload.single('image'), c.uploadInlineImage);
router.get('/history', c.getHistory);
router.get('/templates', c.listTemplates);
router.post('/templates', c.createTemplate);
router.put('/templates/:id', c.updateTemplate);
router.delete('/templates/:id', c.deleteTemplate);

module.exports = router;
