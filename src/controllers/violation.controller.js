const { status } = require("http-status");
const { violationService } = require("../services");
const catchAsync = require("../utils/catchAsync");

/**
 * Create a new violation report
 * POST /violations
 */
const createViolationReport = catchAsync(async (req, res) => {
  const data = await violationService.createViolationReport({
    ...req.body,
    reporter_id: req.user.id,
  });

  res.success(data, status.CREATED);
});

/**
 * Get all violation reports with filtering
 * GET /violations
 */
const getAllViolationReports = catchAsync(async (req, res) => {
  const data = await violationService.getAllViolationReports(req.query);

  res.success(data, status.OK);
});

/**
 * Get my violation reports (student only — reports created by current user)
 * GET /violations/my-reports
 */
const getMyViolationReports = catchAsync(async (req, res) => {
  const data = await violationService.getMyViolationReports(req.user.id);
  res.success(data, status.OK);
});

/**
 * Get violation report by ID
 * GET /violations/:id
 */
const getViolationReportById = catchAsync(async (req, res) => {
  const data = await violationService.getViolationReportById(req.params.id);

  res.success(data, status.OK);
});

/**
 * Review/Update violation report status
 * PUT /violations/:id/review
 */
const reviewViolationReport = catchAsync(async (req, res) => {
  const data = await violationService.reviewViolationReport(
    req.params.id,
    req.body,
    req.user.id
  );

  res.success(data, status.OK);
});

/**
 * Get penalties for a student by student code
 * GET /violations/student/:studentCode/penalties
 */
const getStudentPenalties = catchAsync(async (req, res) => {
  const data = await violationService.getStudentPenalties(req.params.studentCode);

  res.success(data, status.OK);
});

/**
 * Search student by code
 * GET /violations/search-student
 */
const searchStudent = catchAsync(async (req, res) => {
  const { code } = req.query;

  if (!code) {
    throw new Error("Student code is required");
  }

  const data = await violationService.searchStudentByCode(code);

  res.success(data, status.OK);
});

/**
 * Get violation statistics
 * GET /violations/statistics
 */
const getViolationStatistics = catchAsync(async (req, res) => {
  const data = await violationService.getViolationStatistics();

  res.success(data, status.OK);
});

/**
 * Delete violation report
 * DELETE /violations/:id
 */
const deleteViolationReport = catchAsync(async (req, res) => {
  const data = await violationService.deleteViolationReport(req.params.id);

  res.success(data, status.OK);
});

module.exports = {
  createViolationReport,
  getAllViolationReports,
  getViolationReportById,
  getMyViolationReports,
  reviewViolationReport,
  getStudentPenalties,
  searchStudent,
  getViolationStatistics,
  deleteViolationReport,
};
