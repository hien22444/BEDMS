const express = require('express');
const { payosController } = require('../../controllers');

const router = express.Router();

// Public webhook endpoint (verified by signature in controller)
router.post('/webhook', payosController.handleWebhook);

module.exports = router;
