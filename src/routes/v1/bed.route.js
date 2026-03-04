const express = require('express');
const bedController = require('../../controllers/bed.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin', 'manager'));

// GET all beds (filter: room, block, dorm, status, page, limit)
router.get('/', bedController.getAllBeds);

// GET beds by room
router.get('/room/:roomId', bedController.getBedsByRoom);

// GET single bed + occupant
router.get('/:id', bedController.getBedById);

// PATCH bed status (available | maintenance | reserved)
router.patch('/:id/status', bedController.updateBedStatus);

// PATCH change assignment (move student from one bed to another)
router.patch('/assignment/change', bedController.changeBedAssignment);

module.exports = router;
