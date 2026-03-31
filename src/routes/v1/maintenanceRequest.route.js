const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { maintenanceRequestController } = require('../../controllers');

const router = express.Router();

router.post(
  '/my',
  authenticate,
  authorize('student'),
  maintenanceRequestController.createMaintenanceRequest
);
router.get(
  '/my/room-equipment',
  authenticate,
  authorize('student'),
  maintenanceRequestController.getMyRoomEquipment
);
router.get(
  '/my/context',
  authenticate,
  authorize('student'),
  maintenanceRequestController.getMyMaintenanceContext
);
router.get(
  '/my',
  authenticate,
  authorize('student'),
  maintenanceRequestController.getMyMaintenanceRequests
);

router.get(
  '/',
  authenticate,
  authorize('manager'),
  maintenanceRequestController.getAllMaintenanceRequests
);
router.patch(
  '/:id/review',
  authenticate,
  authorize('manager'),
  maintenanceRequestController.reviewMaintenanceRequest
);

module.exports = router;
