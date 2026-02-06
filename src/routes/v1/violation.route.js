const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { violationController } = require("../../controllers");

const router = express.Router();

// Statistics endpoint (must be before /:id to avoid conflict)
router.route("/statistics").get(authenticate, violationController.getViolationStatistics);

// Search student endpoint
router.route("/search-student").get(authenticate, violationController.searchStudent);

// Student penalties endpoint
router
  .route("/student/:studentCode/penalties")
  .get(authenticate, violationController.getStudentPenalties);

// Main CRUD endpoints
router
  .route("/")
  .post(authenticate, violationController.createViolationReport)
  .get(authenticate, violationController.getAllViolationReports);

router
  .route("/:id")
  .get(authenticate, violationController.getViolationReportById)
  .delete(authenticate, violationController.deleteViolationReport);

// Review endpoint
router.route("/:id/review").put(authenticate, violationController.reviewViolationReport);

module.exports = router;
