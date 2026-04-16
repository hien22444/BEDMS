const { CameraConfig } = require('../models');
const AppError = require('../utils/AppError');
const { getFaceServiceAuthHeaders } = require('./internalAuth.service');
const { faceServiceUrl } = require('../utils/faceServiceUrl');

const stopCameraIfActive = async (cameraId) => {
  try {
    const statusRes = await fetch(faceServiceUrl(`/cameras/${cameraId}/status`), {
      headers: {
        ...getFaceServiceAuthHeaders(),
      },
    });
    if (!statusRes.ok) {
      return false;
    }

    const statusData = await statusRes.json();
    if (statusData.status === 'active') {
      await fetch(faceServiceUrl(`/cameras/${cameraId}/stop`), {
        method: 'POST',
        headers: {
          ...getFaceServiceAuthHeaders(),
        },
      });
      return true;
    }
  } catch {
    // FaceService may be unavailable. Source updates should still persist.
  }

  return false;
};

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

  const response = await fetch(faceServiceUrl(`/cameras/${cameraId}/start`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getFaceServiceAuthHeaders(),
    },
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

  const response = await fetch(faceServiceUrl(`/cameras/${cameraId}/stop`), {
    method: 'POST',
    headers: {
      ...getFaceServiceAuthHeaders(),
    },
  });

  const result = await response.json();
  if (!response.ok) {
    throw new AppError(result.detail || 'Failed to stop camera', response.status);
  }

  return result;
};

const getCameraStatus = async (cameraId) => {
  const response = await fetch(faceServiceUrl(`/cameras/${cameraId}/status`), {
    headers: {
      ...getFaceServiceAuthHeaders(),
    },
  });

  if (response.status === 404) {
    return { camera_id: cameraId, status: 'offline' };
  }

  const result = await response.json();
  if (!response.ok) {
    throw new AppError(result.detail || 'Failed to get camera status', response.status);
  }

  return result;
};

const updateCameraSource = async (cameraId, { source_type, source_url }) => {
  const camera = await CameraConfig.findOne({ camera_id: cameraId });
  if (!camera) {
    throw new AppError('Camera not found', 404);
  }

  const normalizedSourceType = String(source_type || '').trim();
  if (!['webcam', 'rtsp'].includes(normalizedSourceType)) {
    throw new AppError('source_type must be "webcam" or "rtsp"', 400);
  }

  const normalizedSourceUrl =
    normalizedSourceType === 'webcam' ? '0' : String(source_url || '').trim();
  if (normalizedSourceType === 'rtsp' && !normalizedSourceUrl) {
    throw new AppError('source_url is required for RTSP cameras', 400);
  }

  await stopCameraIfActive(cameraId);

  camera.source_type = normalizedSourceType;
  camera.source_url = normalizedSourceUrl;
  await camera.save();
  return camera;
};

const resetCameraSource = async (cameraId) => {
  const camera = await CameraConfig.findOne({ camera_id: cameraId });
  if (!camera) {
    throw new AppError('Camera not found', 404);
  }

  await stopCameraIfActive(cameraId);

  camera.source_type = 'webcam';
  camera.source_url = '0';
  await camera.save();
  return camera;
};

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
