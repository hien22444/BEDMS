const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { cameraController } = require('../../controllers');

const router = express.Router();

// List all cameras (security + admin)
router.get(
  '/',
  authenticate,
  authorize('security', 'admin'),
  cameraController.getCameras
);

// Add a camera config (admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  cameraController.createCamera
);

// Update a camera config (admin only)
router.patch(
  '/:cameraId',
  authenticate,
  authorize('admin'),
  cameraController.updateCamera
);

// Start camera capture (security)
router.post(
  '/:cameraId/start',
  authenticate,
  authorize('security', 'admin'),
  cameraController.startCamera
);

// Stop camera capture (security)
router.post(
  '/:cameraId/stop',
  authenticate,
  authorize('security', 'admin'),
  cameraController.stopCamera
);

// Get camera status (security)
router.get(
  '/:cameraId/status',
  authenticate,
  authorize('security', 'admin'),
  cameraController.getCameraStatus
);

module.exports = router;
