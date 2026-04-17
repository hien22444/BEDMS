const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { accessLogController } = require('../../controllers');

const router = express.Router();

// Get access log stats (security + manager)
router.get(
  '/stats',
  authenticate,
  authorize('security', 'manager', 'admin'),
  accessLogController.getStats
);

// Get today's access logs (security)
router.get(
  '/today',
  authenticate,
  authorize('security', 'admin'),
  accessLogController.getToday
);

// Report stats for a specific date (security + manager)
router.get(
  '/report-stats',
  authenticate,
  authorize('security', 'manager', 'admin'),
  accessLogController.getReportStats
);

// Export access logs as Excel (security + manager)
router.get(
  '/export',
  authenticate,
  authorize('security', 'manager', 'admin'),
  accessLogController.exportExcel
);

// List access logs with pagination (security + manager)
router.get(
  '/',
  authenticate,
  authorize('security', 'manager', 'admin'),
  accessLogController.getLogs
);

// Create manual override log entry (security only)
router.post(
  '/manual',
  authenticate,
  authorize('security', 'admin'),
  accessLogController.createManualLog
);

module.exports = router;
