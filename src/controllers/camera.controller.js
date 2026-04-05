const { status } = require('http-status');
const { cameraService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getCameras = catchAsync(async (req, res) => {
  const data = await cameraService.getCameras();
  res.success(data, status.OK);
});

const createCamera = catchAsync(async (req, res) => {
  const data = await cameraService.createCamera(req.body);
  res.success(data, status.CREATED);
});

const updateCamera = catchAsync(async (req, res) => {
  const data = await cameraService.updateCamera(req.params.cameraId, req.body);
  res.success(data, status.OK);
});

const startCamera = catchAsync(async (req, res) => {
  const data = await cameraService.startCamera(req.params.cameraId);

  // Emit camera status update
  const io = req.app.get('io');
  if (io) {
    io.to('security_cameras').emit('camera_status_update', {
      camera_id: req.params.cameraId,
      status: 'active',
    });
  }

  res.success(data, status.OK);
});

const stopCamera = catchAsync(async (req, res) => {
  const data = await cameraService.stopCamera(req.params.cameraId);

  // Emit camera status update
  const io = req.app.get('io');
  if (io) {
    io.to('security_cameras').emit('camera_status_update', {
      camera_id: req.params.cameraId,
      status: 'offline',
    });
  }

  res.success(data, status.OK);
});

const getCameraStatus = catchAsync(async (req, res) => {
  const data = await cameraService.getCameraStatus(req.params.cameraId);
  res.success(data, status.OK);
});

const updateCameraSource = catchAsync(async (req, res) => {
  const { source_type, source_url } = req.body;
  if (!source_type || !source_url) {
    return res.status(400).json({ message: 'source_type and source_url are required' });
  }

  const data = await cameraService.updateCameraSource(req.params.cameraId, {
    source_type,
    source_url,
  });

  // Emit status update so frontend knows camera was reconfigured
  const io = req.app.get('io');
  if (io) {
    io.to('security_cameras').emit('camera_status_update', {
      camera_id: req.params.cameraId,
      status: 'offline',
    });
  }

  res.success(data, status.OK);
});

const resetCameraSource = catchAsync(async (req, res) => {
  const data = await cameraService.resetCameraSource(req.params.cameraId);

  const io = req.app.get('io');
  if (io) {
    io.to('security_cameras').emit('camera_status_update', {
      camera_id: req.params.cameraId,
      status: 'offline',
    });
  }

  res.success(data, status.OK);
});

module.exports = {
  getCameras,
  createCamera,
  updateCamera,
  startCamera,
  stopCamera,
  getCameraStatus,
  updateCameraSource,
  resetCameraSource,
};
