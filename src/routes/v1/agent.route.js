const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { agentController } = require('../../controllers');

const router = express.Router();

router.post('/answer', authenticate, authorize('student'), agentController.answer);
router.get('/dorm-rules', authenticate, authorize('admin'), agentController.getDormRules);
router.put('/dorm-rules', authenticate, authorize('admin'), agentController.updateDormRules);

module.exports = router;
