const { OtherRequest, Notification, User, Student, Contract } = require('../models');
const AppError = require('../utils/AppError');

const generateRequestCode = async (maxRetries = 3) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `OR-${dateStr}-`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastRequest = await OtherRequest.findOne({
      request_code: { $regex: `^${prefix}` },
    }).sort({ request_code: -1 });

    let seq = 1;
    if (lastRequest) {
      const lastSeq = parseInt(lastRequest.request_code.split('-').pop(), 10);
      seq = lastSeq + 1;
    }

    const code = `${prefix}${String(seq).padStart(4, '0')}`;
    const exists = await OtherRequest.findOne({ request_code: code });
    if (!exists) return code;
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
};

const createOtherRequest = async (userId, body) => {
  const student = await Student.findOne({ user: userId }).select('_id').lean();
  if (!student) {
    throw new AppError('Only registered students can create other requests.', 403);
  }

  const activeContract = await Contract.findOne({
    student: student._id,
    status: 'active',
    room: { $ne: null },
    bed: { $ne: null },
  })
    .select('_id')
    .lean();
  if (!activeContract) {
    throw new AppError('You are not currently staying in the dormitory and cannot submit requests.', 403);
  }

  const title = String(body?.title || '').trim();
  const description = String(body?.description || '').trim();

  if (!title) throw new Error('title is required');
  if (!description) throw new Error('description is required');

  const request_code = await generateRequestCode();
  const created = await OtherRequest.create({
    request_code,
    user: userId,
    title,
    description,
  });

  // Notify all active managers
  const managers = await User.find({ role: 'manager', is_active: true }).select('_id').lean();
  if (managers.length > 0) {
    await Notification.insertMany(
      managers.map((m) => ({
        user: m._id,
        title: 'New Other Request from student',
        message: `${request_code}: ${title}`,
        notification_type: 'info',
        category: 'general',
        related_id: created._id.toString(),
      }))
    );
  }

  return created;
};

const getMyOtherRequests = async (userId) => {
  const requests = await OtherRequest.find({ user: userId }).sort({ createdAt: -1 }).lean();
  return requests.map((r) => ({ ...r, id: r._id }));
};

const getAllOtherRequests = async (query = {}) => {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;

  const items = await OtherRequest.find(filter)
    .populate('user', 'fullname email role')
    .populate('reviewed_by', 'fullname email role')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await OtherRequest.countDocuments(filter);

  // Map student_code for student-role users (User doesn't store student_code directly)
  const studentUserIds = items
    .map((i) => (i.user && (i.user._id || i.user.id) ? String(i.user._id || i.user.id) : null))
    .filter(Boolean);

  let studentCodeByUserId = {};
  if (studentUserIds.length > 0) {
    const students = await Student.find({ user: { $in: studentUserIds } }).select('user student_code').lean();
    studentCodeByUserId = students.reduce((acc, s) => {
      acc[String(s.user)] = s.student_code;
      return acc;
    }, {});
  }

  const data = items.map((i) => {
    const userId = i.user && (i.user._id || i.user.id) ? String(i.user._id || i.user.id) : null;
    const student_code = userId ? studentCodeByUserId[userId] : null;
    return {
      ...i,
      id: i._id,
      user: i.user ? { ...i.user, student_code } : i.user,
    };
  });

  return { data, total, page: Number(page), limit: Number(limit) };
};

const reviewOtherRequest = async (requestId, managerUserId, body) => {
  const req = await OtherRequest.findById(requestId);
  if (!req) throw new Error('Other request not found');

  // Once resolved/rejected, the manager cannot update this request anymore.
  if (req.status === 'resolved' || req.status === 'rejected') {
    throw new AppError('This request has been finalized and cannot be edited', 409);
  }

  const nextStatus = String(body?.status || '').trim();
  const allowed = ['in_review', 'resolved', 'rejected'];
  if (!allowed.includes(nextStatus)) {
    throw new Error('status must be one of: in_review, resolved, rejected');
  }
  if (nextStatus === 'rejected' && !String(body?.rejection_reason || '').trim()) {
    throw new Error('rejection_reason is required when status is rejected');
  }

  const managerResponse = String(body?.manager_response || '').trim();
  req.status = nextStatus;
  req.reviewed_at = new Date();
  req.reviewed_by = managerUserId;
  req.manager_response = managerResponse || null;
  req.rejection_reason = nextStatus === 'rejected' ? String(body.rejection_reason).trim() : null;
  await req.save();

  await Notification.create({
    user: req.user,
    title: 'Your Other Request has been updated',
    message: nextStatus === 'rejected'
      ? `${req.request_code} was rejected.${req.rejection_reason ? ` Reason: ${req.rejection_reason}` : ''}${req.manager_response ? ` Response: ${req.manager_response}` : ''}`
      : `${req.request_code} status changed to ${nextStatus}.${req.manager_response ? ` Response: ${req.manager_response}` : ''}`,
    notification_type: nextStatus === 'rejected' ? 'warning' : 'info',
    category: 'general',
    related_id: req._id.toString(),
  });

  return req;
};

module.exports = {
  createOtherRequest,
  getMyOtherRequests,
  getAllOtherRequests,
  reviewOtherRequest,
};
