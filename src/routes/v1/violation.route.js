const express = require("express");
const auth = require("../../middleware/auth");
const { violationController } = require("../../controllers");

const router = express.Router();

// Statistics endpoint (must be before /:id to avoid conflict)
router.route("/statistics").get(auth, violationController.getViolationStatistics);

// Search student endpoint
router.route("/search-student").get(auth, violationController.searchStudent);

// Student penalties endpoint
router
  .route("/student/:studentCode/penalties")
  .get(auth, violationController.getStudentPenalties);

// Main CRUD endpoints
router
  .route("/")
  .post(auth, violationController.createViolationReport)
  .get(auth, violationController.getAllViolationReports);

router
  .route("/:id")
  .get(auth, violationController.getViolationReportById)
  .delete(auth, violationController.deleteViolationReport);

// Review endpoint
router.route("/:id/review").put(auth, violationController.reviewViolationReport);

module.exports = router;
