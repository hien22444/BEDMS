const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { agentController } = require('../../controllers');

const router = express.Router();

router.post('/answer', authenticate, authorize('student'), agentController.answer);

module.exports = router;
