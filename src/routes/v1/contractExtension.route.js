const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { contractExtensionController } = require('../../controllers');

const router = express.Router();

// ── Student routes ────────────────────────────────────────────────────────────
router.post('/my', authenticate, authorize('student'), contractExtensionController.createExtensionRequest);
router.get('/my', authenticate, authorize('student'), contractExtensionController.getMyExtensionRequests);
router.patch('/my/:id/cancel', authenticate, authorize('student'), contractExtensionController.cancelExtensionRequest);

// ── Manager routes ────────────────────────────────────────────────────────────
router.get('/stats', authenticate, authorize('manager'), contractExtensionController.getExtensionStats);
router.get('/', authenticate, authorize('manager'), contractExtensionController.getAllExtensionRequests);
router.get('/:id', authenticate, authorize('manager'), contractExtensionController.getExtensionRequestById);
router.patch('/:id/review', authenticate, authorize('manager'), contractExtensionController.reviewExtensionRequest);

module.exports = router;
