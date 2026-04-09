const { CheckoutRequest, Student, Contract, Staff, User, Notification, RoomInspection, Bed, BookingRequest } = require('../models');
const AppError = require('../utils/AppError');

// ─── helpers ─────────────────────────────────────────────────────────────────

const generateRequestCode = async (maxRetries = 3) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `COR-${dateStr}-`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const last = await CheckoutRequest.findOne({
      request_code: { $regex: `^${prefix}` },
    }).sort({ request_code: -1 });

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.request_code.split('-').pop(), 10);
      seq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
    }

    const code = `${prefix}${String(seq).padStart(4, '0')}`;
    const exists = await CheckoutRequest.findOne({ request_code: code });
    if (!exists) return code;
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
};

const resolveStudent = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError('Only registered students can submit checkout requests.', 403);
  return student;
};

const getActiveContract = async (studentId) => {
  const contract = await Contract.findOne({ student: studentId, status: 'active' })
    .select('room bed semester')
    .lean();
  if (!contract) throw new AppError('You do not have an active contract.', 400);
  return contract;
};

const populateRoomPath = {
  path: 'room',
  select: 'room_number floor room_type block',
  populate: {
    path: 'block',
    select: 'block_name block_code',
    populate: { path: 'dorm', select: 'dorm_name dorm_code' },
  },
};

const populateStudentPath = {
  path: 'student',
  select: 'full_name student_code',
  populate: { path: 'user', select: 'email' },
};

const notifyManagers = async (requestCode, reason, docId) => {
  const managers = await User.find({ role: 'manager', is_active: true }).select('_id').lean();
  if (!managers.length) return;
  await Notification.insertMany(
    managers.map((m) => ({
      user: m._id,
      title: 'New checkout request',
      message: `${requestCode}: ${reason.slice(0, 120)}`,
      notification_type: 'info',
      category: 'checkout',
      related_id: docId.toString(),
    }))
  );
};

const notifyStudent = async (studentDoc, title, message, type, docId) => {
  const student = studentDoc.user
    ? studentDoc
    : await Student.findById(studentDoc).select('user').lean();
  if (!student?.user) return;
  await Notification.create({
    user: student.user,
    title,
    message,
    notification_type: type,
    category: 'checkout',
    related_id: docId.toString(),
  });
};

// ─── student actions ──────────────────────────────────────────────────────────

/**
 * Student gửi checkout request.
 * Body: { expected_checkout_date, reason }
 */
const createCheckoutRequest = async (userId, body, io) => {
  const student = await resolveStudent(userId);
  const contract = await getActiveContract(student._id);

  const expected_checkout_date = new Date(body?.expected_checkout_date);
  if (Number.isNaN(expected_checkout_date.getTime())) {
    throw new AppError('expected_checkout_date must be a valid date.', 400);
  }
  if (expected_checkout_date <= new Date()) {
    throw new AppError('expected_checkout_date must be in the future.', 400);
  }

  const reason = String(body?.reason || '').trim();
  if (!reason || reason.length < 10) {
    throw new AppError('reason is required (at least 10 characters).', 400);
  }

  // Block nếu đã có request đang trong quá trình xử lý (pending / approved / inspected)
  const existing = await CheckoutRequest.findOne({
    student: student._id,
    status: { $in: ['pending', 'approved', 'inspected'] },
  }).lean();
  if (existing) {
    throw new AppError(
      `You already have an active checkout request (status: ${existing.status}). Please wait for it to be completed or cancel it first.`,
      409
    );
  }

  const request_code = await generateRequestCode();
  const doc = await CheckoutRequest.create({
    request_code,
    student: student._id,
    contract: contract._id,
    room: contract.room,
    bed: contract.bed,
    expected_checkout_date,
    reason,
    status: 'pending',
  });

  const populated = await CheckoutRequest.findById(doc._id)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .lean();

  const result = { ...populated, id: populated._id };

  // Notify managers (non-blocking — don't fail the request if notification fails)
  notifyManagers(request_code, reason, doc._id).catch((err) =>
    console.error('[checkout] notifyManagers failed:', err.message)
  );

  // Real-time: notify managers so they see the new request immediately
  if (io) {
    io.to('managers').emit('new_checkout_request', result);
  }

  return result;
};

/** Student xem danh sách request của mình */
const getMyCheckoutRequests = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) return [];

  const list = await CheckoutRequest.find({ student: student._id })
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({ path: 'reviewed_by', select: 'full_name staff_code' })
    .sort({ requested_at: -1 })
    .lean();

  return list.map((r) => ({ ...r, id: r._id }));
};

/** Student huỷ request đang pending */
const cancelCheckoutRequest = async (userId, requestId) => {
  const student = await resolveStudent(userId);

  const req = await CheckoutRequest.findOne({ _id: requestId, student: student._id });
  if (!req) throw new AppError('Checkout request not found.', 404);
  if (req.status !== 'pending') {
    throw new AppError('Only pending requests can be cancelled.', 409);
  }

  req.status = 'cancelled';
  await req.save();

  return { id: req._id, status: req.status };
};

// ─── manager actions ──────────────────────────────────────────────────────────

/** Manager xem tất cả request, filter theo status */
const getAllCheckoutRequests = async (query = {}) => {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;

  const items = await CheckoutRequest.find(filter)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({ path: 'reviewed_by', select: 'full_name staff_code' })
    .populate({
      path: 'inspection',
      select: 'cleanliness_status equipment_status equipment_notes maintenance_needed inspection_photos_urls inspected_by inspected_at',
      populate: { path: 'inspected_by', select: 'full_name staff_code' },
    })
    .sort({ requested_at: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await CheckoutRequest.countDocuments(filter);
  return {
    data: items.map((i) => ({ ...i, id: i._id })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

/** Manager xem chi tiết 1 request */
const getCheckoutRequestById = async (requestId) => {
  const req = await CheckoutRequest.findById(requestId)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({ path: 'contract', select: 'semester start_date end_date status' })
    .populate({ path: 'reviewed_by', select: 'full_name staff_code' })
    .populate({
      path: 'inspection',
      select: 'cleanliness_status equipment_status equipment_notes maintenance_needed inspection_photos_urls inspected_by inspected_at',
      populate: { path: 'inspected_by', select: 'full_name staff_code' },
    })
    .lean();

  if (!req) throw new AppError('Checkout request not found.', 404);
  return { ...req, id: req._id };
};

/**
 * Manager duyệt hoặc từ chối.
 * Body: { status: 'approved' | 'rejected', rejection_reason? }
 */
const reviewCheckoutRequest = async (requestId, managerUserId, body, io) => {
  const req = await CheckoutRequest.findById(requestId);
  if (!req) throw new AppError('Checkout request not found.', 404);

  if (!['pending'].includes(req.status)) {
    throw new AppError(`Cannot review a request with status "${req.status}".`, 409);
  }

  const nextStatus = String(body?.status || '').trim();
  if (!['approved', 'rejected'].includes(nextStatus)) {
    throw new AppError('status must be "approved" or "rejected".', 400);
  }

  if (nextStatus === 'rejected') {
    const rejection_reason = String(body?.rejection_reason || '').trim();
    if (!rejection_reason) {
      throw new AppError('rejection_reason is required when rejecting.', 400);
    }
    req.rejection_reason = rejection_reason;
  }

  const staff = await Staff.findOne({ user: managerUserId }).select('_id full_name').lean();

  req.status = nextStatus;
  req.reviewed_at = new Date();
  req.reviewed_by = staff?._id || null;
  await req.save();

  const studentDoc = await Student.findById(req.student).select('user').lean();
  const isApproved = nextStatus === 'approved';

  const populated = await CheckoutRequest.findById(req._id)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({ path: 'reviewed_by', select: 'full_name staff_code' })
    .lean();

  const result = { ...populated, id: populated._id };

  // Socket first — don't let notification failure block real-time updates
  if (io && isApproved) {
    io.to('security_cameras').emit('checkout_approved', result);
  }
  if (io && studentDoc?.user) {
    io.to(`user_${studentDoc.user}`).emit('checkout_status_updated', result);
  }

  // Notify student (non-blocking)
  notifyStudent(
    studentDoc,
    isApproved ? 'Checkout request approved' : 'Checkout request rejected',
    isApproved
      ? `Your checkout request ${req.request_code} has been approved. Security will inspect your room before the checkout date.`
      : `Your checkout request ${req.request_code} was rejected. Reason: ${req.rejection_reason}`,
    isApproved ? 'success' : 'warning',
    req._id
  ).catch((err) => console.error('[checkout] notifyStudent failed:', err.message));

  return result;
};

/**
 * Manager: complete checkout after inspection.
 * - Terminates contract
 * - Frees bed
 * - Marks checkout request as completed
 */
const completeCheckoutRequest = async (requestId, managerUserId, io) => {
  const req = await CheckoutRequest.findById(requestId);
  if (!req) throw new AppError('Checkout request not found.', 404);

  if (!['inspected'].includes(req.status)) {
    throw new AppError(`Cannot complete a request with status "${req.status}". Room must be inspected first.`, 409);
  }

  const staff = await Staff.findOne({ user: managerUserId }).select('_id').lean();

  const now = new Date();

  // Terminate contract
  const contract = await Contract.findByIdAndUpdate(
    req.contract,
    { status: 'terminated', terminated_at: now },
    { new: true }
  ).lean();

  // Free bed
  await Bed.findByIdAndUpdate(req.bed, { status: 'available' });

  // Set checkout_date on the approved booking (same as manual checkout flow)
  if (contract?.semester) {
    await BookingRequest.findOneAndUpdate(
      { student: req.student, semester: contract.semester, status: 'approved', checkout_date: null },
      { $set: { checkout_date: now } },
      { sort: { requested_at: -1 } }
    );
  }

  // Complete checkout request
  req.status = 'completed';
  await req.save();

  const studentDoc = await Student.findById(req.student).select('user').lean();

  const populated = await CheckoutRequest.findById(req._id)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({
      path: 'inspection',
      select: 'cleanliness_status equipment_status equipment_notes maintenance_needed inspected_by inspected_at',
      populate: { path: 'inspected_by', select: 'full_name staff_code' },
    })
    .lean();

  const result = { ...populated, id: populated._id };

  // Socket first — don't let notification failure block real-time updates
  if (io) {
    if (studentDoc?.user) {
      io.to(`user_${studentDoc.user}`).emit('checkout_completed', result);
    }
    io.to('managers').emit('checkout_status_updated', result);
  }

  // Notify student (non-blocking)
  if (studentDoc?.user) {
    Notification.create({
      user: studentDoc.user,
      title: 'Checkout completed',
      message: `Your checkout request ${req.request_code} has been completed. Your contract has been terminated. Thank you for staying with us.`,
      notification_type: 'success',
      category: 'checkout',
      related_id: req._id.toString(),
    }).catch((err) => console.error('[checkout] notify completed failed:', err.message));
  }

  return result;
};

// ─── security actions ─────────────────────────────────────────────────────────

/**
 * Security: submit room inspection for an approved checkout request.
 * Body: { cleanliness_status, equipment_status, equipment_notes?, maintenance_needed?, inspection_photos_urls? }
 */
const inspectCheckoutRequest = async (requestId, securityUserId, body, io) => {
  const req = await CheckoutRequest.findById(requestId);
  if (!req) throw new AppError('Checkout request not found.', 404);
  if (req.status !== 'approved') {
    throw new AppError(`Cannot inspect a request with status "${req.status}". Only approved requests can be inspected.`, 409);
  }

  const CLEANLINESS = ['clean', 'dirty', 'needs_cleaning'];
  const EQUIPMENT = ['complete', 'missing', 'damaged'];

  const cleanliness_status = String(body?.cleanliness_status || '').trim();
  const equipment_status = String(body?.equipment_status || '').trim();

  if (!CLEANLINESS.includes(cleanliness_status)) {
    throw new AppError(`cleanliness_status must be one of: ${CLEANLINESS.join(', ')}`, 400);
  }
  if (!EQUIPMENT.includes(equipment_status)) {
    throw new AppError(`equipment_status must be one of: ${EQUIPMENT.join(', ')}`, 400);
  }

  const staff = await Staff.findOne({ user: securityUserId }).select('_id full_name').lean();
  if (!staff) throw new AppError('Security staff profile not found.', 403);

  const equipment_notes = String(body?.equipment_notes || '').trim() || undefined;
  const maintenance_needed = String(body?.maintenance_needed || '').trim() || undefined;
  const inspection_photos_urls = Array.isArray(body?.inspection_photos_urls)
    ? body.inspection_photos_urls.map((u) => String(u).trim()).filter(Boolean)
    : [];

  // Create RoomInspection record
  const inspection = await RoomInspection.create({
    room: req.room,
    contract: req.contract,
    inspection_type: 'check_out',
    cleanliness_status,
    equipment_status,
    equipment_notes,
    maintenance_needed,
    inspection_photos_urls,
    inspected_by: staff._id,
    inspected_at: new Date(),
  });

  // Update CheckoutRequest
  req.status = 'inspected';
  req.inspection = inspection._id;
  await req.save();

  const studentDoc = await Student.findById(req.student).select('user').lean();

  const populated = await CheckoutRequest.findById(req._id)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({ path: 'inspection' })
    .lean();

  const result = { ...populated, id: populated._id };

  // Socket first — don't let notification failure block real-time updates
  if (io) {
    io.to('managers').emit('checkout_inspected', result);
    if (studentDoc?.user) {
      io.to(`user_${studentDoc.user}`).emit('checkout_status_updated', result);
    }
  }

  // Notify managers (non-blocking)
  const hasIssue = equipment_status !== 'complete' || cleanliness_status !== 'clean';
  User.find({ role: 'manager', is_active: true }).select('_id').lean()
    .then((managers) => {
      if (!managers.length) return;
      return Notification.insertMany(
        managers.map((m) => ({
          user: m._id,
          title: 'Room inspection completed',
          message: `${req.request_code}: Room inspected by security. ${hasIssue ? '⚠ Issues found — review required.' : 'No issues found.'}`,
          notification_type: hasIssue ? 'warning' : 'success',
          category: 'checkout',
          related_id: req._id.toString(),
        }))
      );
    })
    .catch((err) => console.error('[checkout] notifyManagers inspect failed:', err.message));

  // Notify student (non-blocking)
  notifyStudent(
    studentDoc,
    'Room inspection completed',
    `Your room for request ${req.request_code} has been inspected. The manager will review and complete your checkout.`,
    'info',
    req._id
  ).catch((err) => console.error('[checkout] notifyStudent inspect failed:', err.message));

  return result;
};

/**
 * Security: get all approved checkout requests (to inspect)
 */
const getApprovedCheckoutRequests = async (query = {}) => {
  const { page = 1, limit = 50 } = query;

  const items = await CheckoutRequest.find({ status: 'approved' })
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .sort({ reviewed_at: 1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await CheckoutRequest.countDocuments({ status: 'approved' });
  return {
    data: items.map((i) => ({ ...i, id: i._id })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

/**
 * Security: get inspection history (inspected / completed / pending_payment)
 */
const getCheckoutInspectionHistory = async (query = {}) => {
  const { page = 1, limit = 50 } = query;
  const filter = { status: { $in: ['inspected', 'pending_payment', 'completed'] } };

  const items = await CheckoutRequest.find(filter)
    .populate(populateStudentPath)
    .populate(populateRoomPath)
    .populate({ path: 'bed', select: 'bed_number' })
    .populate({
      path: 'inspection',
      select: 'cleanliness_status equipment_status equipment_notes maintenance_needed inspected_by inspected_at',
      populate: { path: 'inspected_by', select: 'full_name staff_code' },
    })
    .sort({ updatedAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await CheckoutRequest.countDocuments(filter);
  return {
    data: items.map((i) => ({ ...i, id: i._id })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

module.exports = {
  createCheckoutRequest,
  getMyCheckoutRequests,
  cancelCheckoutRequest,
  getAllCheckoutRequests,
  getCheckoutRequestById,
  reviewCheckoutRequest,
  completeCheckoutRequest,
  inspectCheckoutRequest,
  getApprovedCheckoutRequests,
  getCheckoutInspectionHistory,
};
