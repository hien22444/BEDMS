const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { invoiceController } = require('../../controllers');

const router = express.Router();

router.get('/my', authenticate, authorize('student'), invoiceController.getMyInvoices);

module.exports = router;
