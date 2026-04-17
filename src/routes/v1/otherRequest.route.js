const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { otherRequestController } = require('../../controllers');

const router = express.Router();

// Student
router.post('/my', authenticate, authorize('student'), otherRequestController.createOtherRequest);
router.get('/my', authenticate, authorize('student'), otherRequestController.getMyOtherRequests);

// Manager
router.get('/', authenticate, authorize('manager'), otherRequestController.getAllOtherRequests);
router.patch('/:id/review', authenticate, authorize('manager'), otherRequestController.reviewOtherRequest);

module.exports = router;
