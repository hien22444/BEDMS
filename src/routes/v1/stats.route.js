const express = require('express');
const { getDashboard, getBedUsage } = require('../../controllers/stats.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin', 'manager'));

router.get('/dashboard', getDashboard);
router.get('/bed-usage', getBedUsage);

module.exports = router;
