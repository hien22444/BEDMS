const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { visitorController } = require('../../controllers');

const router = express.Router();

// ─── Student endpoints ───

// Create visitor request (student only)
router.post(
  '/requests',
  authenticate,
  authorize('student'),
  visitorController.createVisitorRequest
);

// Get my visitor requests (student only)
router.get(
  '/requests/my',
  authenticate,
  authorize('student'),
  visitorController.getMyVisitorRequests
);

// Cancel my visitor request (student only)
router.patch(
  '/requests/:id/cancel',
  authenticate,
  authorize('student'),
  visitorController.cancelVisitorRequest
);

// ─── Security endpoints ───

// Get all visitor requests (security + manager)
router.get(
  '/requests',
  authenticate,
  authorize('security', 'manager'),
  visitorController.getAllVisitorRequests
);

// Get visitor request detail (security + manager)
router.get(
  '/requests/:id',
  authenticate,
  authorize('security', 'manager'),
  visitorController.getVisitorRequestDetail
);

// Approve visitor request (security)
router.patch(
  '/requests/:id/approve',
  authenticate,
  authorize('security'),
  visitorController.approveVisitorRequest
);

// Reject visitor request (security)
router.patch(
  '/requests/:id/reject',
  authenticate,
  authorize('security'),
  visitorController.rejectVisitorRequest
);

// Complete visitor request — manual (security)
router.patch(
  '/requests/:id/complete',
  authenticate,
  authorize('security'),
  visitorController.completeVisitorRequest
);

// Check in a visitor (security)
router.post(
  '/requests/:id/checkin',
  authenticate,
  authorize('security'),
  visitorController.checkinVisitor
);

// Check out a visitor (security)
router.patch(
  '/checkins/:checkinId/checkout',
  authenticate,
  authorize('security'),
  visitorController.checkoutVisitor
);

// Get active visitors in dorm (security)
router.get('/active', authenticate, authorize('security'), visitorController.getActiveVisitors);

module.exports = router;
