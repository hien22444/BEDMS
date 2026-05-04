const { StudentAccessLog } = require('../models');
const AppError = require('../utils/AppError');
const {
  getDormDayRange,
  getEndOfDayInDormTimezone,
  getStartOfDayInDormTimezone,
  getStartOfTodayInDormTimezone,
} = require('../utils/dateOnly');

const createManualLog = async (data, userId) => {
  const { name, idCard, type, reason, notes } = data;

  if (!type || !['check_in', 'check_out'].includes(type)) {
    throw new AppError('type must be check_in or check_out', 400);
  }
  if (!name) {
    throw new AppError('name is required for manual override', 400);
  }
  if (!idCard) {
    throw new AppError('ID card is required for manual override', 400);
  }
  if (!reason || !['camera_failed', 'other'].includes(reason)) {
    throw new AppError('reason must be camera_failed or other', 400);
  }

  const log = await StudentAccessLog.create({
    type,
    method: 'manual',
    logged_by: userId,
    manual_reason: reason,
    visitor_name: name,
    id_card: idCard,
    notes,
  });

  const populated = await StudentAccessLog.findById(log._id)
    .populate('student', 'student_code full_name avatar_url')
    .populate('logged_by', 'email fullname')
    .lean();

  return populated;
};

const getToday = async () => {
  const startOfDay = getStartOfTodayInDormTimezone();

  const logs = await StudentAccessLog.find({
    createdAt: { $gte: startOfDay },
  })
    .populate('student', 'student_code full_name avatar_url')
    .populate('logged_by', 'email fullname')
    .sort({ createdAt: -1 })
    .lean();

  return logs;
};

const getLogs = async (query) => {
  const { page = 1, limit = 50, type, method, studentId, date, startDate, endDate } = query;
  const filter = {};

  if (type) filter.type = type;
  if (method) filter.method = method;
  if (studentId) filter.student = studentId;
  if (startDate && endDate) {
    const start = getStartOfDayInDormTimezone(startDate);
    const end = getEndOfDayInDormTimezone(endDate);
    filter.createdAt = { $gte: start, $lte: end };
  } else if (date) {
    const { start, end } = getDormDayRange(date);
    filter.createdAt = { $gte: start, $lte: end };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [logs, total] = await Promise.all([
    StudentAccessLog.find(filter)
      .populate('student', 'student_code full_name avatar_url')
      .populate('logged_by', 'email fullname')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    StudentAccessLog.countDocuments(filter),
  ]);

  return {
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

// A log counts as a "successful" access event if it has an identified student
// or it's a manual override (manual logs have student=null but visitor_name/id_card).
// Unknown face-recognition attempts (method='face_recognition' AND student=null)
// must be excluded from check-in/check-out totals.
const SUCCESSFUL_FILTER = { $or: [{ student: { $ne: null } }, { method: 'manual' }] };
const UNKNOWN_FILTER = { method: 'face_recognition', student: null };

const getStats = async () => {
  const startOfDay = getStartOfTodayInDormTimezone();
  const dateFilter = { createdAt: { $gte: startOfDay } };

  const [checkIns, checkOuts] = await Promise.all([
    StudentAccessLog.countDocuments({ ...dateFilter, ...SUCCESSFUL_FILTER, type: 'check_in' }),
    StudentAccessLog.countDocuments({ ...dateFilter, ...SUCCESSFUL_FILTER, type: 'check_out' }),
  ]);

  return {
    todayCheckIns: checkIns,
    todayCheckOuts: checkOuts,
    currentlyInside: Math.max(0, checkIns - checkOuts),
  };
};

const getReportStats = async (query) => {
  const { date, startDate, endDate } = query;
  let start;
  let end;
  if (startDate && endDate) {
    start = getStartOfDayInDormTimezone(startDate);
    end = getEndOfDayInDormTimezone(endDate);
  } else {
    ({ start, end } = getDormDayRange(date || new Date()));
  }

  const dateFilter = { createdAt: { $gte: start, $lte: end } };

  const [checkIns, checkOuts, manualOverrides, unknownAttempts] = await Promise.all([
    StudentAccessLog.countDocuments({ ...dateFilter, ...SUCCESSFUL_FILTER, type: 'check_in' }),
    StudentAccessLog.countDocuments({ ...dateFilter, ...SUCCESSFUL_FILTER, type: 'check_out' }),
    StudentAccessLog.countDocuments({ ...dateFilter, method: 'manual' }),
    StudentAccessLog.countDocuments({ ...dateFilter, ...UNKNOWN_FILTER }),
  ]);

  return {
    totalCheckIns: checkIns,
    totalCheckOuts: checkOuts,
    currentlyInside: Math.max(0, checkIns - checkOuts),
    manualOverrides,
    unknownAttempts,
  };
};

const getLogsForExport = async (query) => {
  const { startDate, endDate, type, method } = query;

  const filter = {};
  if (startDate && endDate) {
    const start = getStartOfDayInDormTimezone(startDate);
    const end = getEndOfDayInDormTimezone(endDate);
    filter.createdAt = { $gte: start, $lte: end };
  }
  if (type) filter.type = type;
  if (method) filter.method = method;

  return StudentAccessLog.find(filter)
    .populate('student', 'student_code full_name')
    .populate('logged_by', 'email fullname')
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  createManualLog,
  getToday,
  getLogs,
  getStats,
  getReportStats,
  getLogsForExport,
};
