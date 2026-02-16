const { ViolationReport, Penalty, Student, Staff } = require("../models");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Generate unique report code
 */
const generateReportCode = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const prefix = `VR${year}${month}${day}`;

  const lastReport = await ViolationReport.findOne({
    report_code: { $regex: `^${prefix}` },
  }).sort({ report_code: -1 });

  let sequence = 1;
  if (lastReport) {
    const lastSequence = parseInt(lastReport.report_code.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(4, "0")}`;
};

/**
 * Get current semester (format: e.g., "Spring2026", "Fall2025")
 */
const getCurrentSemester = () => {
  const date = new Date();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month >= 1 && month <= 4) {
    return `Spring${year}`;
  } else if (month >= 5 && month <= 8) {
    return `Summer${year}`;
  } else {
    return `Fall${year}`;
  }
};

/**
 * Create a new violation report
 */
const createViolationReport = async (body) => {
  // Find student by student_code
  const student = await Student.findOne({ student_code: body.student_code });
  if (!student) {
    throw new Error(`Student with code ${body.student_code} not found`);
  }

  const reportCode = await generateReportCode();

  const violationReport = new ViolationReport({
    report_code: reportCode,
    reported_student: student._id,
    reporter: body.reporter_id,
    reporter_type: body.reporter_type,
    violation_type: body.violation_type,
    description: body.description,
    evidence_urls: body.evidence_urls || [],
    violation_date: body.violation_date,
    location: body.location,
    status: "new",
  });

  await violationReport.save();

  return violationReport.populate([
    { path: "reported_student", select: "student_code full_name" },
    { path: "reporter", select: "fullname email" },
  ]);
};

/**
 * Get all violation reports with filtering and pagination
 */
const getAllViolationReports = async (query = {}) => {
  const {
    page = 1,
    limit = 10,
    status,
    violation_type,
    student_code,
    start_date,
    end_date,
  } = query;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (violation_type) {
    filter.violation_type = violation_type;
  }

  if (student_code) {
    const student = await Student.findOne({ student_code });
    if (student) {
      filter.reported_student = student._id;
    }
  }

  if (start_date || end_date) {
    filter.violation_date = {};
    if (start_date) {
      filter.violation_date.$gte = new Date(start_date);
    }
    if (end_date) {
      filter.violation_date.$lte = new Date(end_date);
    }
  }

  const skip = (page - 1) * limit;

  const [reports, total] = await Promise.all([
    ViolationReport.find(filter)
      .populate([
        { path: "reported_student", select: "student_code full_name phone behavioral_score" },
        { path: "reporter", select: "fullname email" },
        { path: "reviewed_by", select: "full_name" },
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ViolationReport.countDocuments(filter),
  ]);

  return {
    data: reports,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get violation report by ID
 */
const getViolationReportById = async (id) => {
  const report = await ViolationReport.findById(id).populate([
    { path: "reported_student", select: "student_code full_name phone behavioral_score violations_current_semester" },
    { path: "reporter", select: "fullname email" },
    { path: "reviewed_by", select: "full_name" },
  ]);

  if (!report) {
    throw new Error("Violation report not found");
  }

  return report;
};

/**
 * Update violation report status (review)
 */
const reviewViolationReport = async (id, body, staffId) => {
  const report = await ViolationReport.findById(id);
  if (!report) {
    throw new Error("Violation report not found");
  }

  report.status = body.status;
  report.review_notes = body.review_notes;
  report.reviewed_by = staffId;
  report.reviewed_at = new Date();

  await report.save();

  // If penalized, create penalty and update student score
  if (body.status === "resolved_penalized" && body.penalty) {
    await createPenaltyFromReport(report, body.penalty, staffId);
  }

  return report.populate([
    { path: "reported_student", select: "student_code full_name" },
    { path: "reviewed_by", select: "full_name" },
  ]);
};

/**
 * Create penalty from violation report
 */
const createPenaltyFromReport = async (report, penaltyData, staffId) => {
  const penalty = new Penalty({
    student: report.reported_student,
    report: report._id,
    penalty_type: penaltyData.penalty_type,
    points_deducted: penaltyData.points_deducted,
    reason: penaltyData.reason || report.description,
    semester: getCurrentSemester(),
    issued_by: staffId,
  });

  await penalty.save();

  // Update student behavioral score
  const student = await Student.findById(report.reported_student);
  if (student) {
    const newScore = Math.max(0, student.behavioral_score - penaltyData.points_deducted);
    student.behavioral_score = newScore;
    student.violations_current_semester += 1;

    // Check for ban conditions (e.g., score below 4 or 3+ violations)
    if (newScore < 4 || student.violations_current_semester >= 3) {
      student.ban_until_semester = getNextSemester();
    }

    await student.save();
  }

  return penalty;
};

/**
 * Get next semester for ban
 */
const getNextSemester = () => {
  const date = new Date();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month >= 1 && month <= 4) {
    return `Summer${year}`;
  } else if (month >= 5 && month <= 8) {
    return `Fall${year}`;
  } else {
    return `Spring${year + 1}`;
  }
};

/**
 * Get all penalties for a student
 */
const getStudentPenalties = async (studentCode) => {
  const student = await Student.findOne({ student_code: studentCode });
  if (!student) {
    throw new Error(`Student with code ${studentCode} not found`);
  }

  const penalties = await Penalty.find({ student: student._id })
    .populate([
      { path: "report", select: "report_code violation_type description" },
      { path: "issued_by", select: "full_name" },
    ])
    .sort({ issued_at: -1 });

  return {
    student: {
      student_code: student.student_code,
      full_name: student.full_name,
      behavioral_score: student.behavioral_score,
      violations_current_semester: student.violations_current_semester,
      is_banned_permanently: student.is_banned_permanently,
      ban_until_semester: student.ban_until_semester,
    },
    penalties,
  };
};

/**
 * Search student by student code
 */
const searchStudentByCode = async (studentCode) => {
  const student = await Student.findOne({
    student_code: { $regex: escapeRegex(studentCode), $options: "i" },
  }).select("student_code full_name phone behavioral_score violations_current_semester");

  return student;
};

/**
 * Get violation statistics
 */
const getViolationStatistics = async () => {
  const currentSemester = getCurrentSemester();

  const [
    totalReports,
    newReports,
    underReviewReports,
    resolvedPenalized,
    resolvedNoAction,
    rejectedReports,
    totalPenaltiesThisSemester,
  ] = await Promise.all([
    ViolationReport.countDocuments(),
    ViolationReport.countDocuments({ status: "new" }),
    ViolationReport.countDocuments({ status: "under_review" }),
    ViolationReport.countDocuments({ status: "resolved_penalized" }),
    ViolationReport.countDocuments({ status: "resolved_no_action" }),
    ViolationReport.countDocuments({ status: "rejected" }),
    Penalty.countDocuments({ semester: currentSemester }),
  ]);

  return {
    totalReports,
    byStatus: {
      new: newReports,
      under_review: underReviewReports,
      resolved_penalized: resolvedPenalized,
      resolved_no_action: resolvedNoAction,
      rejected: rejectedReports,
    },
    currentSemester,
    totalPenaltiesThisSemester,
  };
};

/**
 * Delete violation report (only new reports can be deleted)
 */
const deleteViolationReport = async (id) => {
  const report = await ViolationReport.findById(id);
  if (!report) {
    throw new Error("Violation report not found");
  }

  if (report.status !== "new") {
    throw new Error("Only new reports can be deleted");
  }

  await ViolationReport.findByIdAndDelete(id);
  return { message: "Violation report deleted successfully" };
};

module.exports = {
  createViolationReport,
  getAllViolationReports,
  getViolationReportById,
  reviewViolationReport,
  getStudentPenalties,
  searchStudentByCode,
  getViolationStatistics,
  deleteViolationReport,
};
