const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { roomTransferController } = require('../../controllers');

const router = express.Router();

router
  .route('/my')
  .get(authenticate, authorize('student'), roomTransferController.getMyTransferRequests);

router
  .route('/my/history')
  .get(authenticate, authorize('student'), roomTransferController.getMyTransferHistory);

router
  .route('/my/available-beds')
  .get(authenticate, authorize('student'), roomTransferController.getAvailableBedsForTransfer);

router
  .route('/my/empty-bed')
  .post(authenticate, authorize('student'), roomTransferController.createEmptyBedTransferRequest);

router
  .route('/my/swap')
  .post(authenticate, authorize('student'), roomTransferController.createSwapTransferRequest);

router
  .route('/my/swap-target')
  .get(authenticate, authorize('student'), roomTransferController.getSwapTargetPreview);

router
  .route('/my/:id/respond')
  .patch(authenticate, authorize('student'), roomTransferController.respondSwapTransferRequest);

router
  .route('/my/:id/cancel')
  .patch(authenticate, authorize('student'), roomTransferController.cancelTransferRequest);

router
  .route('/my/:id/payment-status')
  .get(authenticate, authorize('student'), roomTransferController.checkTransferSupplementPayment);

router
  .route('/')
  .get(authenticate, authorize('manager'), roomTransferController.getAllTransferRequests);

router
  .route('/:id/confirm-refund')
  .patch(authenticate, authorize('manager'), roomTransferController.confirmRefundProcessed);

router
  .route('/:id/review')
  .patch(authenticate, authorize('manager'), roomTransferController.reviewTransferRequest);

module.exports = router;
