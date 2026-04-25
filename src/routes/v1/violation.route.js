const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { violationController } = require('../../controllers');

const router = express.Router();

// Statistics — manager and security can view
router
  .route('/statistics')
  .get(authenticate, authorize('manager', 'security'), violationController.getViolationStatistics);

// Search student — manager and security can search
router
  .route('/search-student')
  .get(authenticate, authorize('manager', 'security'), violationController.searchStudent);

// Student penalties — manager and security can view
router
  .route('/student/:studentCode/penalties')
  .get(authenticate, authorize('manager', 'security'), violationController.getStudentPenalties);

// Upload evidence image
router
  .route('/upload-evidence')
  .post(
    authenticate,
    authorize('manager', 'security', 'student'),
    require('../../middleware/upload').uploadImage,
    violationController.uploadEvidenceImage
  );

// Create violation — manager, security, and student
router
  .route('/')
  .post(
    authenticate,
    authorize('manager', 'security', 'student'),
    violationController.createViolationReport
  );

// List violations — manager and security only
router
  .route('/')
  .get(authenticate, authorize('manager', 'security'), violationController.getAllViolationReports);

// My violation reports — student only (must be before /:id)
router
  .route('/my-reports')
  .get(authenticate, authorize('student'), violationController.getMyViolationReports);

// My CFD penalties / deduction history — student only
router
  .route('/my-penalties')
  .get(authenticate, authorize('student'), violationController.getMyPenalties);

// View single violation — manager and security
// Delete violation — manager only
router
  .route('/:id')
  .get(authenticate, authorize('manager', 'security'), violationController.getViolationReportById)
  .delete(authenticate, authorize('manager'), violationController.deleteViolationReport);

// Review violation — manager only (approve/reject)
router
  .route('/:id/review')
  .put(authenticate, authorize('manager'), violationController.reviewViolationReport);

module.exports = router;
