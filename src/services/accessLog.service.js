const { StudentAccessLog, Student } = require('../models');
const AppError = require('../utils/AppError');

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
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

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
  const { page = 1, limit = 50, type, method, studentId, date } = query;
  const filter = {};

  if (type) filter.type = type;
  if (method) filter.method = method;
  if (studentId) filter.student = studentId;
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
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

const getStats = async () => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [checkIns, checkOuts] = await Promise.all([
    StudentAccessLog.countDocuments({
      type: 'check_in',
      createdAt: { $gte: startOfDay },
    }),
    StudentAccessLog.countDocuments({
      type: 'check_out',
      createdAt: { $gte: startOfDay },
    }),
  ]);

  return {
    todayCheckIns: checkIns,
    todayCheckOuts: checkOuts,
    currentlyInside: Math.max(0, checkIns - checkOuts),
  };
};

const getReportStats = async (query) => {
  const { date } = query;
  const start = date ? new Date(date) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  const dateFilter = { createdAt: { $gte: start, $lte: end } };

  const [checkIns, checkOuts, manualOverrides] = await Promise.all([
    StudentAccessLog.countDocuments({ ...dateFilter, type: 'check_in' }),
    StudentAccessLog.countDocuments({ ...dateFilter, type: 'check_out' }),
    StudentAccessLog.countDocuments({ ...dateFilter, method: 'manual' }),
  ]);

  return {
    totalCheckIns: checkIns,
    totalCheckOuts: checkOuts,
    currentlyInside: Math.max(0, checkIns - checkOuts),
    manualOverrides,
  };
};

const getLogsForExport = async (query) => {
  const { startDate, endDate, type, method } = query;

  const filter = {};
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
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
