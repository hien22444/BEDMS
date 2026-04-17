const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { dateConfigController } = require('../../controllers');

const router = express.Router();

// Manager: get current date config
router.get('/', authenticate, authorize('manager'), dateConfigController.getDateConfig);

// Manager: update date config
router.put('/', authenticate, authorize('manager'), dateConfigController.updateDateConfig);

module.exports = router;
