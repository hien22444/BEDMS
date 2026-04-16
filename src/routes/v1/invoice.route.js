const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { invoiceController } = require('../../controllers');

const router = express.Router();

// ─── Student routes ────────────────────────────────────────────────────────────
router.get('/my', authenticate, authorize('student'), invoiceController.getMyInvoices);
router.post('/:id/payos-link', authenticate, authorize('student'), invoiceController.createPayosLinkForInvoice);
router.get('/:id/payment-status', authenticate, authorize('student'), invoiceController.getInvoicePaymentStatus);

// ─── Manager routes ────────────────────────────────────────────────────────────
router.get('/', authenticate, authorize('manager'), invoiceController.getInvoices);
router.post('/', authenticate, authorize('manager'), invoiceController.createInvoiceForStudent);
router.post('/ew/student', authenticate, authorize('manager'), invoiceController.createEWInvoiceForStudent);
router.post('/bulk/room/:roomId', authenticate, authorize('manager'), invoiceController.createInvoicesForRoom);
router.post('/bulk/block/:blockId', authenticate, authorize('manager'), invoiceController.createInvoicesForBlock);
router.post('/ew/block', authenticate, authorize('manager'), invoiceController.createEWInvoicesForAllBlocks);
router.patch('/:id/cancel', authenticate, authorize('manager'), invoiceController.cancelInvoice);
router.delete('/:id', authenticate, authorize('manager'), invoiceController.deleteInvoice);
router.get('/:id', authenticate, authorize('manager'), invoiceController.getInvoiceDetail);

module.exports = router;
