const { CameraConfig } = require('../models');
const AppError = require('../utils/AppError');

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'http://localhost:8000';

const getCameras = async () => {
  return CameraConfig.find().sort({ type: 1 }).lean();
};

const createCamera = async (data) => {
  const existing = await CameraConfig.findOne({ camera_id: data.camera_id });
  if (existing) {
    throw new AppError('Camera ID already exists', 409);
  }
  return CameraConfig.create(data);
};

const updateCamera = async (cameraId, data) => {
  const camera = await CameraConfig.findOneAndUpdate(
    { camera_id: cameraId },
    data,
    { new: true }
  );
  if (!camera) {
    throw new AppError('Camera not found', 404);
  }
  return camera;
};

const startCamera = async (cameraId) => {
  const camera = await CameraConfig.findOne({ camera_id: cameraId });
  if (!camera) {
    throw new AppError('Camera not found', 404);
  }

  const response = await fetch(`${FACE_SERVICE_URL}/cameras/${cameraId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_type: camera.source_type,
      source_url: camera.source_url,
      camera_type: camera.type,
      fps_target: camera.fps_target,
      recognition_threshold: camera.recognition_threshold,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new AppError(result.detail || 'Failed to start camera', response.status);
  }

  return result;
};

const stopCamera = async (cameraId) => {
  const camera = await CameraConfig.findOne({ camera_id: cameraId });
  if (!camera) {
    throw new AppError('Camera not found', 404);
  }

  const response = await fetch(`${FACE_SERVICE_URL}/cameras/${cameraId}/stop`, {
    method: 'POST',
  });

  const result = await response.json();
  if (!response.ok) {
    throw new AppError(result.detail || 'Failed to stop camera', response.status);
  }

  return result;
};

const getCameraStatus = async (cameraId) => {
  const response = await fetch(`${FACE_SERVICE_URL}/cameras/${cameraId}/status`);

  if (response.status === 404) {
    return { camera_id: cameraId, status: 'offline' };
  }

  const result = await response.json();
  if (!response.ok) {
    throw new AppError(result.detail || 'Failed to get camera status', response.status);
  }

  return result;
};

module.exports = {
  getCameras,
  createCamera,
  updateCamera,
  startCamera,
  stopCamera,
  getCameraStatus,
};
