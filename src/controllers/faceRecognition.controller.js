const { status } = require('http-status');
const { faceRecognitionService, notificationService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const cameraLabel = (id) => (id ? id : 'unknown camera');
const directionLabel = (type) => (type === 'check_in' ? 'check-in' : 'check-out');

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
  const data = await faceRecognitionService.registerFace(studentId, req.file.buffer, req.user.id);
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

  const io = req.app.get('io');
  const result = await faceRecognitionService.handleDetectionCallback(req.body, io);

  // Emit Socket.io event to security cameras room
  if (io) {
    io.to('security_cameras').emit('face_detection_result', result);
    // Emit each new access log (matched + unknown) for real-time activity & notifications
    if (result.matchedLogs) {
      for (const log of result.matchedLogs) {
        io.to('security_cameras').emit('access_log_created', log);
      }
    }
    if (result.unknownLog) {
      io.to('security_cameras').emit('access_log_created', result.unknownLog);
    }
  }

  // Persist notifications for security/admin users (one row per user, kept until cleared)
  try {
    if (result.matchedLogs) {
      for (const log of result.matchedLogs) {
        const name = log.student?.full_name || 'Student';
        const code = log.student?.student_code ? ` (${log.student.student_code})` : '';
        await notificationService.createSecurityNotifications(
          {
            title: `${name} ${directionLabel(log.type)}`,
            message: `${name}${code} ${directionLabel(log.type)} at ${cameraLabel(log.camera_id)}`,
            category: 'access',
            notification_type: 'success',
            related_id: log._id?.toString() || log.id,
          },
          io
        );
      }
    }
    if (result.unknownLog) {
      const log = result.unknownLog;
      await notificationService.createSecurityNotifications(
        {
          title: `Unknown ${directionLabel(log.type)} attempt`,
          message: `Unrecognized face at ${cameraLabel(log.camera_id)} (${directionLabel(log.type)})`,
          category: 'access',
          notification_type: 'warning',
          related_id: log._id?.toString() || log.id,
        },
        io
      );
    }
  } catch (err) {
    // Don't fail the callback because notification fan-out failed
    console.error('[Notifications] Security fan-out failed:', err.message);
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
