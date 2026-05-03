const { ViolationReport, Penalty, Student, Staff, Contract, Bed, Room, BookingRequest } = require('../models');
const AppError = require('../utils/AppError');
const {
  getDateCodeInDormTimezone,
  getDatePartsInDormTimezone,
  getEndOfDayInDormTimezone,
  getStartOfDayInDormTimezone,
} = require('../utils/dateOnly');

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
  const prefix = `VR${getDateCodeInDormTimezone().slice(2)}`;

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
  const { month, year } = getDatePartsInDormTimezone(new Date());

  if (month >= 1 && month <= 4) {
    return `Spring${year}`;
  } else if (month >= 5 && month <= 8) {
    return `Summer${year}`;
  } else {
    return `Fall${year}`;
  }
};

const ensureStudentInDorm = async (studentId, notAllowedMessage) => {
  const activeContract = await Contract.findOne({
    student: studentId,
    status: 'active',
    room: { $ne: null },
    bed: { $ne: null },
  })
    .select('_id')
    .lean();
  if (!activeContract) {
    throw new AppError(
      notAllowedMessage || 'Only students currently staying in the dormitory can be reported/penalized.',
      403
    );
  }
};

const resolveReportedStudents = async (body) => {
  const rawCodes = Array.isArray(body.student_codes) ? body.student_codes : [];
  const normalizedCodes = [
    ...new Set(
      rawCodes
        .map((code) => String(code || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  if (normalizedCodes.length > 0) {
    const students = await Student.find({
      student_code: { $in: normalizedCodes },
    });
    if (students.length !== normalizedCodes.length) {
      const found = new Set(students.map((s) => String(s.student_code).toUpperCase()));
      const missing = normalizedCodes.filter((code) => !found.has(code));
      throw new AppError(`Student code(s) not found: ${missing.join(', ')}`, 404);
    }
    return students;
  }

  if (!body.student_code) {
    throw new Error('student_code or student_codes is required for manager/security reports');
  }

  const student = await Student.findOne({ student_code: body.student_code });
  if (!student) {
    throw new Error(`Student with code ${body.student_code} not found`);
  }
  return [student];
};

const enforceAutoDormSuspension = async (studentId) => {
  const activeContract = await Contract.findOne({
    student: studentId,
    status: { $in: ['active', 'extended'] },
    room: { $ne: null },
    bed: { $ne: null },
  }).lean();

  if (!activeContract) return false;

  const now = new Date();

  await Contract.findByIdAndUpdate(activeContract._id, {
    $set: { status: 'terminated', terminated_at: now },
  });

  const upcomingForBed = await Contract.findOne({
    bed: activeContract.bed,
    status: 'upcoming',
  }).lean();

  await Bed.findByIdAndUpdate(activeContract.bed, {
    $set: { status: upcomingForBed ? 'reserved' : 'available' },
  });

  const room = await Room.findById(activeContract.room).select('total_beds');
  if (room) {
    const availableCount = await Bed.countDocuments({
      room: activeContract.room,
      status: 'available',
    });
    room.available_beds = availableCount;
    room.status = availableCount > 0 ? 'available' : 'full';
    await room.save();
  }

  await BookingRequest.findOneAndUpdate(
    {
      student: studentId,
      semester: activeContract.semester,
      status: 'approved',
      checkout_date: null,
    },
    { $set: { checkout_date: now } },
    { sort: { requested_at: -1 } }
  );

  return true;
};

/**
 * Recalculate and persist a student's behavioral snapshot based on existing penalties.
 * This keeps Student.behavioral_score in sync even if penalties are edited/deleted manually in DB.
 */
const syncStudentBehavioralSnapshot = async (studentId) => {
  const student = await Student.findById(studentId);
  if (!student) return null;

  const penalties = await Penalty.find({ student: student._id }).select('points_deducted');
  const totalDeducted = penalties.reduce((sum, p) => sum + (Number(p.points_deducted) || 0), 0);
  const violationsCount = penalties.length;
  const recalculatedScore = Math.max(0, 10 - totalDeducted);
  const shouldSuspendDormService = recalculatedScore <= 0;

  student.behavioral_score = recalculatedScore;
  student.violations_current_semester = violationsCount;
  student.dorm_booking_suspended = shouldSuspendDormService;
  student.is_banned_permanently = shouldSuspendDormService;
  student.ban_until_semester = null;

  await student.save();

  if (shouldSuspendDormService) {
    await enforceAutoDormSuspension(student._id);
  }

  return student;
};

/**
 * Create a new violation report
 */
/**
 * Create a new violation report
 * @param {Object} body
 * @param {import('socket.io').Server} io
 */
const createViolationReport = async (body, io) => {
  let students = [];
  let reporterCode = null;

  // If reporter is a student, only set reporter code; reported_student stays null until manager penalizes
  if (body.reporter_type === 'student') {
    const reporterStudent = await Student.findOne({ user: body.reporter_id });
    if (!reporterStudent) {
      throw new Error('Student profile not found for current user');
    }
    const activeContract = await Contract.findOne({
      student: reporterStudent._id,
      status: 'active',
      room: { $ne: null },
      bed: { $ne: null },
    })
      .select('_id')
      .lean();
    if (!activeContract) {
      throw new AppError('You are not currently staying in the dormitory and cannot submit requests.', 403);
    }
    reporterCode = reporterStudent.student_code;
  } else {
    students = await resolveReportedStudents(body);
    for (const student of students) {
      await ensureStudentInDorm(
        student._id,
        'Managers/Security can only create violation reports for students currently staying in the dormitory.'
      );
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
    ...(students.length ? { reported_student: students[0]._id } : {}),
    ...(students.length ? { reported_students: students.map((s) => s._id) } : {}),
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
    if (students.length > 0) {
      for (const student of students) {
        await createPenaltyFromReport(
          violationReport,
          {
            ...body.initial_penalty,
            student_code: student.student_code,
          },
          body.reporter_id
        );
      }
    } else {
      await createPenaltyFromReport(violationReport, body.initial_penalty, body.reporter_id);
    }
  }

  const populated = await violationReport.populate([
    { path: 'reported_student', select: 'student_code full_name user' },
    { path: 'reported_students', select: 'student_code full_name phone behavioral_score user' },
    { path: 'reporter', select: 'fullname email' },
  ]);
  await enrichReporterStudentCode(populated);

  if (io) {
    io.to('managers').emit('new_violation_report', populated);
    // If student is reported, notify them in real-time
    const notifiedUserIds = new Set();
    const studentUsers = [];
    if (populated.reported_student?.user) {
      studentUsers.push(populated.reported_student.user);
    }
    if (Array.isArray(populated.reported_students)) {
      populated.reported_students.forEach((s) => {
        if (s?.user) studentUsers.push(s.user);
      });
    }
    studentUsers.forEach((userObj) => {
      const studentUserId = userObj._id || userObj;
      const key = String(studentUserId);
      if (notifiedUserIds.has(key)) return;
      notifiedUserIds.add(key);
      io.to(`user_${studentUserId}`).emit('violation_updated', populated);
      if (body.initial_penalty) {
        io.to(`user_${studentUserId}`).emit('cfd_updated', {
          report_code: populated.report_code,
        });
      }
    });
  }

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
      filter.$or = [{ reported_student: student._id }, { reported_students: student._id }];
    }
  }

  if (start_date || end_date) {
    filter.violation_date = {};
    if (start_date) {
      filter.violation_date.$gte = getStartOfDayInDormTimezone(start_date);
    }
    if (end_date) {
      filter.violation_date.$lte = getEndOfDayInDormTimezone(end_date);
    }
  }

  const skip = (page - 1) * limit;

  const [reports, total] = await Promise.all([
    ViolationReport.find(filter)
      .populate([
        { path: 'reported_student', select: 'student_code full_name phone behavioral_score' },
        { path: 'reported_students', select: 'student_code full_name phone behavioral_score' },
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
    {
      path: 'reported_students',
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
/**
 * Update violation report status (review)
 * @param {string} id
 * @param {Object} body
 * @param {string} staffId
 * @param {import('socket.io').Server} io
 */
const reviewViolationReport = async (id, body, staffId, io) => {
  const report = await ViolationReport.findById(id);
  if (!report) {
    throw new Error('Violation report not found');
  }

  report.status = body.status;
  report.review_notes = body.review_notes;
  report.reviewed_by = staffId;
  report.reviewed_at = new Date();

  let penaltyStudentCodes = [];
  if (body.status === 'resolved_penalized' && body.penalty) {
    const rawCodes = Array.isArray(body.penalty.student_codes) ? body.penalty.student_codes : [];
    penaltyStudentCodes = [
      ...new Set(
        rawCodes
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      ),
    ];

    // Backward compatibility: allow single student_code payload.
    if (!penaltyStudentCodes.length && body.penalty.student_code) {
      penaltyStudentCodes = [String(body.penalty.student_code).trim().toUpperCase()];
    }

    if (penaltyStudentCodes.length) {
      const penalizedStudents = await Student.find({
        student_code: { $in: penaltyStudentCodes },
      }).select('_id student_code');
      if (penalizedStudents.length !== penaltyStudentCodes.length) {
        const foundCodes = new Set(penalizedStudents.map((s) => String(s.student_code).toUpperCase()));
        const missingCodes = penaltyStudentCodes.filter((code) => !foundCodes.has(code));
        throw new AppError(`Student code(s) not found: ${missingCodes.join(', ')}`, 404);
      }
      report.reported_students = penalizedStudents.map((s) => s._id);
      report.reported_student = penalizedStudents[0]._id;
    }
  }

  await report.save();

  // If penalized, create penalty and update student score
  if (body.status === 'resolved_penalized' && body.penalty) {
    if (penaltyStudentCodes.length > 0) {
      for (const studentCode of penaltyStudentCodes) {
        await createPenaltyFromReport(
          report,
          {
            ...body.penalty,
            student_code: studentCode,
          },
          staffId
        );
      }
    } else {
      await createPenaltyFromReport(report, body.penalty, staffId);
    }
  }

  const populated = await report.populate([
    { path: 'reported_student', select: 'student_code full_name user' },
    { path: 'reported_students', select: 'student_code full_name phone behavioral_score user' },
    { path: 'reporter', select: 'fullname email' },
    { path: 'reviewed_by', select: 'full_name' },
  ]);
  await enrichReporterStudentCode(populated);

  if (io) {
    io.to('managers').emit('violation_updated', populated);
    // Notify all affected students (single or batch), deduplicated.
    const usersToNotify = new Set();
    if (populated.reported_student?.user) {
      usersToNotify.add(String(populated.reported_student.user._id || populated.reported_student.user));
    }
    if (Array.isArray(populated.reported_students)) {
      populated.reported_students.forEach((student) => {
        if (student?.user) {
          usersToNotify.add(String(student.user._id || student.user));
        }
      });
    }

    usersToNotify.forEach((studentUserId) => {
      io.to(`user_${studentUserId}`).emit('violation_updated', populated);
      if (body.status === 'resolved_penalized') {
        io.to(`user_${studentUserId}`).emit('cfd_updated', {
          report_code: populated.report_code,
        });
      }
    });
  }

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
    await ensureStudentInDorm(
      studentByCode._id,
      'Only students currently staying in the dormitory can be penalized.'
    );
    studentId = studentByCode._id;
  }

  await ensureStudentInDorm(
    studentId,
    'Only students currently staying in the dormitory can be penalized.'
  );

  const studentBeforePenalty = await syncStudentBehavioralSnapshot(studentId);
  const currentScore = Number(studentBeforePenalty?.behavioral_score) || 0;
  const requestedPoints = Number(penaltyData.points_deducted);
  const maxIntegerDeduction = Math.floor(currentScore);

  if (!(requestedPoints > 0)) {
    throw new AppError('points_deducted must be greater than 0.', 400);
  }

  if (!Number.isInteger(requestedPoints)) {
    throw new AppError('points_deducted must be an integer value.', 400);
  }

  if (currentScore <= 0) {
    throw new AppError(
      `Student ${studentBeforePenalty?.student_code || ''} already has 0 CFD score and cannot be deducted further.`,
      400
    );
  }

  if (maxIntegerDeduction < 1) {
    throw new AppError(
      `Student ${studentBeforePenalty?.student_code || ''} does not have enough score for an integer deduction.`,
      400
    );
  }

  if (requestedPoints > maxIntegerDeduction) {
    throw new AppError(
      `Points to deduct cannot exceed current CFD score (${maxIntegerDeduction}).`,
      400
    );
  }

  const penalty = new Penalty({
    student: studentId,
    report: report._id,
    penalty_type: penaltyData.penalty_type,
    points_deducted: requestedPoints,
    reason: penaltyData.reason || report.description,
    semester: getCurrentSemester(),
    issued_by: staffId,
  });

  await penalty.save();

  // Keep snapshot fields in Student synchronized with real penalty records.
  await syncStudentBehavioralSnapshot(studentId);

  return penalty;
};

/**
 * Get next semester for ban
 */
const getNextSemester = () => {
  const { month, year } = getDatePartsInDormTimezone(new Date());

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
  let student = await Student.findOne({ student_code: studentCode });
  if (!student) {
    throw new Error(`Student with code ${studentCode} not found`);
  }

  student = await syncStudentBehavioralSnapshot(student._id);

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
      dorm_booking_suspended: !!student.dorm_booking_suspended,
    },
    penalties,
  };
};

/**
 * CFD / penalties for the logged-in student (resolved from user id)
 */
const getMyPenaltiesForStudentUser = async (userId) => {
  let student = await Student.findOne({ user: userId });
  if (!student) {
    return { student: null, penalties: [] };
  }

  student = await syncStudentBehavioralSnapshot(student._id);

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
      dorm_booking_suspended: !!student.dorm_booking_suspended,
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

  let student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${escapeRegex(code)}$`, 'i') },
  }).select('student_code full_name phone behavioral_score violations_current_semester');

  if (student) {
    await ensureStudentInDorm(
      student._id,
      `Student ${student.student_code} is not currently staying in the dormitory.`
    );
    student = await syncStudentBehavioralSnapshot(student._id);
  }

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
    .populate([
      { path: 'reported_student', select: 'student_code full_name' },
      { path: 'reported_students', select: 'student_code full_name' },
    ])
    .sort({ createdAt: -1 })
    .limit(100);

  return reports;
};

/**
 * Delete violation report (only new reports can be deleted)
 */
/**
 * Delete violation report (only new reports can be deleted)
 * @param {string} id
 * @param {import('socket.io').Server} io
 */
const deleteViolationReport = async (id, io) => {
  const report = await ViolationReport.findById(id);
  if (!report) {
    throw new Error('Violation report not found');
  }

  if (report.status !== 'new') {
    throw new Error('Only new reports can be deleted');
  }

  await ViolationReport.findByIdAndDelete(id);

  if (io) {
    io.to('managers').emit('violation_deleted', id);
  }

  return { message: 'Violation report deleted successfully' };
};

module.exports = {
  createViolationReport,
  getAllViolationReports,
  getViolationReportById,
  getMyViolationReports,
  reviewViolationReport,
  getStudentPenalties,
  getMyPenaltiesForStudentUser,
  searchStudentByCode,
  getViolationStatistics,
  deleteViolationReport,
};
