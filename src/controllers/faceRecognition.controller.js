const { status } = require('http-status');
const { faceRecognitionService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const registerFace = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(status.BAD_REQUEST).json({
      success: false,
      message: 'Image file is required',
    });
  }
  const { studentId } = req.body;
  if (!studentId) {
    return res.status(status.BAD_REQUEST).json({
      success: false,
      message: 'studentId is required',
    });
  }
  const data = await faceRecognitionService.registerFace(
    studentId,
    req.file.buffer,
    req.user.id
  );
  res.success(data, status.CREATED);
});

const removeFace = catchAsync(async (req, res) => {
  const data = await faceRecognitionService.removeFace(req.params.studentId);
  res.success(data, status.OK);
});

const getRegisteredStudents = catchAsync(async (req, res) => {
  const data = await faceRecognitionService.getRegisteredStudents();
  res.success(data, status.OK);
});

const getStudentFaceDetail = catchAsync(async (req, res) => {
  const data = await faceRecognitionService.getStudentFaceDetail(req.params.studentId);
  res.success(data, status.OK);
});

/**
 * Callback endpoint for FaceService.
 * Authenticated via X-API-Key header (shared secret, not JWT).
 */
const handleCallback = catchAsync(async (req, res) => {
  const expectedKey = process.env.FACE_SERVICE_API_KEY;
  if (!expectedKey) {
    return res.status(status.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'FACE_SERVICE_API_KEY is not configured on server',
    });
  }
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== expectedKey) {
    return res.status(status.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid API key',
    });
  }

  const result = await faceRecognitionService.handleDetectionCallback(req.body);

  // Emit Socket.io event to security cameras room
  const io = req.app.get('io');
  if (io) {
    io.to('security_cameras').emit('face_detection_result', result);
  }

  res.success(result, status.OK);
});

const getAllStudents = catchAsync(async (req, res) => {
  const data = await faceRecognitionService.getAllStudents();
  res.success(data, status.OK);
});

module.exports = {
  registerFace,
  removeFace,
  getRegisteredStudents,
  getStudentFaceDetail,
  handleCallback,
  getAllStudents,
};
