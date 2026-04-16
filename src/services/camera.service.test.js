jest.mock('../models', () => ({
  CameraConfig: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('./internalAuth.service', () => ({
  getFaceServiceAuthHeaders: jest.fn(() => ({
    Authorization: 'Bearer test-token',
  })),
}));

const { CameraConfig } = require('../models');
const cameraService = require('./camera.service');

describe('cameraService FaceService auth forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('adds the bearer token when starting a camera', async () => {
    CameraConfig.findOne.mockResolvedValue({
      camera_id: 'cam-1',
      source_type: 'webcam',
      source_url: '0',
      type: 'checkin',
      fps_target: 5,
      recognition_threshold: 0.6,
    });

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });

    await cameraService.startCamera('cam-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cameras/cam-1/start'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('adds the bearer token when stopping a camera', async () => {
    CameraConfig.findOne.mockResolvedValue({ camera_id: 'cam-1' });

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });

    await cameraService.stopCamera('cam-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cameras/cam-1/stop'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('adds the bearer token when reading camera status', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ camera_id: 'cam-1', status: 'active' }),
    });

    await cameraService.getCameraStatus('cam-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cameras/cam-1/status'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
});
