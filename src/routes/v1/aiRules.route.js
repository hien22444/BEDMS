const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { aiRulesController } = require('../../controllers');

const router = express.Router();

router.get('/rules', authenticate, authorize('student'), aiRulesController.getAllRules);
router.post('/rules/query', authenticate, authorize('student'), aiRulesController.queryRules);

module.exports = router;
