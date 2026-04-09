const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkoutRequestController } = require('../../controllers');

const router = express.Router();

// ── Student routes ────────────────────────────────────────────────────────────
router.post('/my', authenticate, authorize('student'), checkoutRequestController.createCheckoutRequest);
router.get('/my', authenticate, authorize('student'), checkoutRequestController.getMyCheckoutRequests);
router.patch('/my/:id/cancel', authenticate, authorize('student'), checkoutRequestController.cancelCheckoutRequest);

// ── Security routes ───────────────────────────────────────────────────────────
router.get('/approved', authenticate, authorize('security'), checkoutRequestController.getApprovedCheckoutRequests);
router.get('/history', authenticate, authorize('security'), checkoutRequestController.getCheckoutInspectionHistory);
router.patch('/:id/inspect', authenticate, authorize('security'), checkoutRequestController.inspectCheckoutRequest);

// ── Manager routes ────────────────────────────────────────────────────────────
router.get('/', authenticate, authorize('manager'), checkoutRequestController.getAllCheckoutRequests);
router.get('/:id', authenticate, authorize('manager'), checkoutRequestController.getCheckoutRequestById);
router.patch('/:id/review', authenticate, authorize('manager'), checkoutRequestController.reviewCheckoutRequest);
router.patch('/:id/complete', authenticate, authorize('manager'), checkoutRequestController.completeCheckoutRequest);

module.exports = router;
