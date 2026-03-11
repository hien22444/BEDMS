const { ViolationReport, Penalty, Student, Staff } = require('../models');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Add reporter.student_code (student_code for students, staff_code for staff) */
const enrichReporterStudentCode = async (report) => {
  if (!report?.reporter?._id) return report;

  const userId = report.reporter._id;
  let code = null;

  if (report.reporter_type === 'student') {
    const student = await Student.findOne({ user: userId }).select('student_code');
    if (student) code = student.student_code;
  } else if (report.reporter_type === 'manager' || report.reporter_type === 'security') {
    const staff = await Staff.findOne({ user: userId }).select('staff_code');
    if (staff) code = staff.staff_code;
  }

  if (code) {
    report.reporter.student_code = code;
    report.reporter_code = code;
  }

  return report;
};

/** Add reporter.student_code for multiple reports */
const enrichReportsReporterStudentCode = async (reports) => {
  const studentReporters = reports.filter((r) => r.reporter_type === 'student' && r.reporter);
  const staffReporters = reports.filter(
    (r) => (r.reporter_type === 'manager' || r.reporter_type === 'security') && r.reporter
  );

  const studentUserIds = [
    ...new Set(studentReporters.map((r) => r.reporter._id?.toString()).filter(Boolean)),
  ];
  const staffUserIds = [
    ...new Set(staffReporters.map((r) => r.reporter._id?.toString()).filter(Boolean)),
  ];

  const [students, staff] = await Promise.all([
    Student.find({ user: { $in: studentUserIds } }).select('user student_code'),
    Staff.find({ user: { $in: staffUserIds } }).select('user staff_code'),
  ]);

  const studentMap = Object.fromEntries(students.map((s) => [s.user.toString(), s.student_code]));
  const staffMap = Object.fromEntries(staff.map((s) => [s.user.toString(), s.staff_code]));

  reports.forEach((r) => {
    const reporterId = r.reporter?._id && r.reporter._id.toString();
    if (!reporterId) return;

    let code = null;

    if (r.reporter_type === 'student' && studentMap[reporterId]) {
      code = studentMap[reporterId];
    } else if (
      (r.reporter_type === 'manager' || r.reporter_type === 'security') &&
      staffMap[reporterId]
    ) {
      code = staffMap[reporterId];
    }

    if (code) {
      r.reporter.student_code = code;
      r.reporter_code = code;
    }
  });

  return reports;
};

/**
 * Generate unique report code with retry loop to handle concurrent requests.
 * Pattern: VRYYMMDDxxxx (e.g. VR2602220001)
 */
const generateReportCode = async (maxRetries = 5) => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const prefix = `VR${year}${month}${day}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastReport = await ViolationReport.findOne({
      report_code: { $regex: `^${prefix}` },
    }).sort({ report_code: -1 });

    let sequence = 1;
    if (lastReport) {
      const lastSequence = parseInt(lastReport.report_code.slice(-4));
      sequence = lastSequence + 1;
    }

    const code = `${prefix}${String(sequence).padStart(4, '0')}`;

    // Check if code is already taken (race condition guard)
    const exists = await ViolationReport.findOne({ report_code: code });
    if (!exists) return code;
    // Code collided — loop and try next sequence
  }

  // Fallback: timestamp-based suffix (collision-safe for edge cases)
  return `${prefix}${Date.now().toString().slice(-4)}`;
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
  let student;
  let reporterCode = null;

  // If reporter is a student, only set reporter code; reported_student stays null until manager penalizes
  if (body.reporter_type === 'student') {
    const reporterStudent = await Student.findOne({ user: body.reporter_id });
    if (!reporterStudent) {
      throw new Error('Student profile not found for current user');
    }
    reporterCode = reporterStudent.student_code;
    student = null;
  } else {
    // Manager / security must specify student_code explicitly
    if (!body.student_code) {
      throw new Error('student_code is required for manager/security reports');
    }
    student = await Student.findOne({ student_code: body.student_code });
    if (!student) {
      throw new Error(`Student with code ${body.student_code} not found`);
    }

    // Manager / security reporter — try to resolve staff_code
    const staff = await Staff.findOne({ user: body.reporter_id }).select('staff_code');
    if (staff) {
      reporterCode = staff.staff_code;
    }
  }

  if (body.violation_type === 'other' && !body.violation_other_detail) {
    throw new Error("violation_other_detail is required when violation_type is 'other'");
  }

  const reportCode = await generateReportCode();

  const violationReport = new ViolationReport({
    report_code: reportCode,
    ...(student ? { reported_student: student._id } : {}),
    reporter: body.reporter_id,
    reporter_type: body.reporter_type,
    reporter_code: reporterCode,
    violation_type: body.violation_type,
    violation_other_detail: body.violation_other_detail,
    description: body.description,
    evidence_urls: body.evidence_urls || [],
    violation_date: body.violation_date,
    location: body.location,
    status: 'new',
  });

  try {
    await violationReport.save();
  } catch (err) {
    // Duplicate key on report_code is a last-resort race condition; surface a clear error
    if (err.code === 11000) {
      throw new Error('Report code conflict. Please try again.');
    }
    throw err;
  }

  // If manager provided initial penalty on creation, immediately penalize and close report
  if (body.initial_penalty) {
    violationReport.status = 'resolved_penalized';
    violationReport.reviewed_by = body.reporter_id;
    violationReport.reviewed_at = new Date();
    await violationReport.save();

    await createPenaltyFromReport(violationReport, body.initial_penalty, body.reporter_id);
  }

  const populated = await violationReport.populate([
    { path: 'reported_student', select: 'student_code full_name' },
    { path: 'reporter', select: 'fullname email' },
  ]);
  await enrichReporterStudentCode(populated);
  return populated;
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
        { path: 'reported_student', select: 'student_code full_name phone behavioral_score' },
        { path: 'reporter', select: 'fullname email' },
        { path: 'reviewed_by', select: 'full_name' },
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ViolationReport.countDocuments(filter),
  ]);

  await enrichReportsReporterStudentCode(reports);

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
    {
      path: 'reported_student',
      select: 'student_code full_name phone behavioral_score violations_current_semester',
    },
    { path: 'reporter', select: 'fullname email' },
    { path: 'reviewed_by', select: 'full_name' },
  ]);

  if (!report) {
    throw new Error('Violation report not found');
  }

  await enrichReporterStudentCode(report);
  return report;
};

/**
 * Update violation report status (review)
 */
const reviewViolationReport = async (id, body, staffId) => {
  const report = await ViolationReport.findById(id);
  if (!report) {
    throw new Error('Violation report not found');
  }

  report.status = body.status;
  report.review_notes = body.review_notes;
  report.reviewed_by = staffId;
  report.reviewed_at = new Date();

  // When penalizing, set reported_student to the student being penalized (so details show correctly)
  if (body.status === 'resolved_penalized' && body.penalty?.student_code) {
    const penalizedStudent = await Student.findOne({
      student_code: {
        $regex: new RegExp(`^${escapeRegex(body.penalty.student_code.trim())}$`, 'i'),
      },
    }).select('_id');
    if (penalizedStudent) {
      report.reported_student = penalizedStudent._id;
    }
  }

  await report.save();

  // If penalized, create penalty and update student score
  if (body.status === 'resolved_penalized' && body.penalty) {
    await createPenaltyFromReport(report, body.penalty, staffId);
  }

  const populated = await report.populate([
    { path: 'reported_student', select: 'student_code full_name' },
    { path: 'reporter', select: 'fullname email' },
    { path: 'reviewed_by', select: 'full_name' },
  ]);
  await enrichReporterStudentCode(populated);
  return populated;
};

/**
 * Create penalty from violation report
 */
const createPenaltyFromReport = async (report, penaltyData, staffId) => {
  let studentId = report.reported_student;

  if (penaltyData.student_code) {
    const studentByCode = await Student.findOne({
      student_code: {
        $regex: new RegExp(`^${escapeRegex(penaltyData.student_code.trim())}$`, 'i'),
      },
    });
    if (!studentByCode) {
      throw new Error(`Student with code "${penaltyData.student_code}" not found`);
    }
    studentId = studentByCode._id;
  }

  const penalty = new Penalty({
    student: studentId,
    report: report._id,
    penalty_type: penaltyData.penalty_type,
    points_deducted: penaltyData.points_deducted,
    reason: penaltyData.reason || report.description,
    semester: getCurrentSemester(),
    issued_by: staffId,
  });

  await penalty.save();

  // Update student behavioral score
  const student = await Student.findById(studentId);
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
      { path: 'report', select: 'report_code violation_type description' },
      { path: 'issued_by', select: 'full_name' },
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
 * Search student by student code — full code only (exact match).
 * Partial input (e.g. "DE" or "DE1") does not return a result.
 */
const searchStudentByCode = async (studentCode) => {
  const code = (studentCode || '').trim();
  if (!code) return null;

  const student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${escapeRegex(code)}$`, 'i') },
  }).select('student_code full_name phone behavioral_score violations_current_semester');

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
    ViolationReport.countDocuments({ status: 'new' }),
    ViolationReport.countDocuments({ status: 'under_review' }),
    ViolationReport.countDocuments({ status: 'resolved_penalized' }),
    ViolationReport.countDocuments({ status: 'resolved_no_action' }),
    ViolationReport.countDocuments({ status: 'rejected' }),
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
 * Get violation reports created by the current user (for student "My Reports")
 */
const getMyViolationReports = async (reporterId) => {
  const reports = await ViolationReport.find({ reporter: reporterId })
    .populate([{ path: 'reported_student', select: 'student_code full_name' }])
    .sort({ createdAt: -1 })
    .limit(100);

  return reports;
};

/**
 * Delete violation report (only new reports can be deleted)
 */
const deleteViolationReport = async (id) => {
  const report = await ViolationReport.findById(id);
  if (!report) {
    throw new Error('Violation report not found');
  }

  if (report.status !== 'new') {
    throw new Error('Only new reports can be deleted');
  }

  await ViolationReport.findByIdAndDelete(id);
  return { message: 'Violation report deleted successfully' };
};

module.exports = {
  createViolationReport,
  getAllViolationReports,
  getViolationReportById,
  getMyViolationReports,
  reviewViolationReport,
  getStudentPenalties,
  searchStudentByCode,
  getViolationStatistics,
  deleteViolationReport,
};
