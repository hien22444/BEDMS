const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { uploadImage } = require('../../middleware/upload');
const { faceRecognitionController } = require('../../controllers');

const router = express.Router();

// Register a student's face (manager only)
router.post(
  '/register',
  authenticate,
  authorize('manager', 'admin'),
  uploadImage,
  faceRecognitionController.registerFace
);

// Remove a student's face registration (manager only)
router.delete(
  '/:studentId',
  authenticate,
  authorize('manager', 'admin'),
  faceRecognitionController.removeFace
);

// List all students for face registration selector (manager + admin)
router.get(
  '/all-students',
  authenticate,
  authorize('manager', 'admin'),
  faceRecognitionController.getAllStudents
);

// List all students with face registration status (manager + security)
router.get(
  '/students',
  authenticate,
  authorize('manager', 'security', 'admin'),
  faceRecognitionController.getRegisteredStudents
);

// Get face registration detail for a student (manager + security)
router.get(
  '/students/:studentId',
  authenticate,
  authorize('manager', 'security', 'admin'),
  faceRecognitionController.getStudentFaceDetail
);

// Callback from FaceService (API key auth, no JWT)
router.post('/callback', faceRecognitionController.handleCallback);

module.exports = router;
