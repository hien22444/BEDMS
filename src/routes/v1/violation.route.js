const express = require("express");
const { authenticate, authorize } = require("../../middleware/auth");
const { violationController } = require("../../controllers");

const router = express.Router();

// Statistics — manager and security can view
router.route("/statistics").get(authenticate, authorize("manager", "security"), violationController.getViolationStatistics);

// Search student — manager and security can search
router.route("/search-student").get(authenticate, authorize("manager", "security"), violationController.searchStudent);

// Student penalties — manager and security can view
router
  .route("/student/:studentCode/penalties")
  .get(authenticate, authorize("manager", "security"), violationController.getStudentPenalties);

// Create violation — manager and security only
// List violations — manager and security only
router
  .route("/")
  .post(authenticate, authorize("manager", "security"), violationController.createViolationReport)
  .get(authenticate, authorize("manager", "security"), violationController.getAllViolationReports);

// View single violation — manager and security
// Delete violation — manager only
router
  .route("/:id")
  .get(authenticate, authorize("manager", "security"), violationController.getViolationReportById)
  .delete(authenticate, authorize("manager"), violationController.deleteViolationReport);

// Review violation — manager only (approve/reject)
router.route("/:id/review").put(authenticate, authorize("manager"), violationController.reviewViolationReport);

module.exports = router;
