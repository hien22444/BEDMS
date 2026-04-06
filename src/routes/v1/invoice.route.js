const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { invoiceController } = require('../../controllers');

const router = express.Router();

router.get('/my', authenticate, authorize('student'), invoiceController.getMyInvoices);
router.post(
  '/:id/payos-link',
  authenticate,
  authorize('student'),
  invoiceController.createPayosLinkForInvoice
);
router.get(
  '/:id/payment-status',
  authenticate,
  authorize('student'),
  invoiceController.getInvoicePaymentStatus
);

module.exports = router;
