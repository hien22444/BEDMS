const express = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../../middleware/auth');
const { ewUsageController } = require('../../controllers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Student route
router.get('/my', authenticate, authorize('student'), ewUsageController.getMyEWUsages);

// Manager-only routes
router.get('/', authenticate, authorize('manager'), ewUsageController.getEWUsages);
router.post('/', authenticate, authorize('manager'), ewUsageController.createEWUsage);
router.post('/quick-create', authenticate, authorize('manager'), ewUsageController.quickCreateEWUsage);
router.get('/export', authenticate, authorize('manager'), ewUsageController.exportEWUsages);
router.post('/import', authenticate, authorize('manager'), upload.single('file'), ewUsageController.importEWUsages);
router.post('/recalculate', authenticate, authorize('manager'), ewUsageController.recalculate);
router.put('/reset', authenticate, authorize('manager'), ewUsageController.resetMeter);
router.put('/:id', authenticate, authorize('manager'), ewUsageController.updateEWUsage);

module.exports = router;
