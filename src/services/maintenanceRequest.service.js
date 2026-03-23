const {
  MaintenanceRequest,
  Student,
  Contract,
  User,
  Staff,
  RoomEquipment,
  Notification,
} = require('../models');
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

const ISSUE_TYPES = ['electrical', 'water', 'ac', 'furniture', 'cleaning', 'other'];
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];

const generateRequestCode = async (maxRetries = 3) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `MR-${dateStr}-`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastRequest = await MaintenanceRequest.findOne({
      request_code: { $regex: `^${prefix}` },
    }).sort({ request_code: -1 });

    let seq = 1;
    if (lastRequest) {
      const lastSeq = parseInt(lastRequest.request_code.split('-').pop(), 10);
      seq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
    }

    const code = `${prefix}${String(seq).padStart(4, '0')}`;
    const exists = await MaintenanceRequest.findOne({ request_code: code });
    if (!exists) return code;
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
};

const resolveStudent = async (userId) => {
  const student = await Student.findOne({ user: userId });
  if (!student) {
    throw new AppError('Only registered students can submit maintenance requests.', 403);
  }
  return student;
};

const getActiveContractRoomId = async (studentId) => {
  const contract = await Contract.findOne({
    student: studentId,
    status: 'active',
  })
    .select('room bed')
    .lean();

  if (!contract?.room) {
    throw new AppError(
      'You do not have an active room assignment. Maintenance reports require an assigned dorm room.',
      400
    );
  }
  return { roomId: contract.room, bedId: contract.bed || null };
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

const populateBedPath = {
  path: 'bed',
  select: 'bed_number',
};

/**
 * Student: report damaged equipment / facility issue in assigned room
 */
const createMaintenanceRequest = async (userId, body) => {
  const student = await resolveStudent(userId);
  const { roomId, bedId } = await getActiveContractRoomId(student._id);

  const issue_type = String(body?.issue_type || 'other').trim();
  const priority = String(body?.priority || 'medium').trim();
  const description = String(body?.description || '').trim();
  const evidence_urls = Array.isArray(body?.evidence_urls)
    ? body.evidence_urls.map((u) => String(u).trim()).filter(Boolean)
    : [];

  if (!ISSUE_TYPES.includes(issue_type)) {
    throw new AppError(`issue_type must be one of: ${ISSUE_TYPES.join(', ')}`, 400);
  }
  if (!PRIORITIES.includes(priority)) {
    throw new AppError(`priority must be one of: ${PRIORITIES.join(', ')}`, 400);
  }
  if (!description || description.length < 10) {
    throw new AppError('description is required (at least 10 characters)', 400);
  }

  let equipment = null;
  if (body?.equipment) {
    const equipmentInput = String(body?.equipment || '').trim();
    if (!equipmentInput) {
      throw new AppError('Invalid equipment selection', 400);
    }

    // Accept either RoomEquipment _id OR equipment_code (so FE can submit code like manager UI).
    let eq = null;
    if (mongoose.Types.ObjectId.isValid(equipmentInput)) {
      eq = await RoomEquipment.findById(equipmentInput).lean();
      if (eq && String(eq.room) !== String(roomId)) eq = null;
    }

    if (!eq) {
      eq = await RoomEquipment.findOne({
        room: roomId,
        equipment_code: equipmentInput,
      }).lean();
    }

    if (!eq) {
      throw new AppError('Invalid equipment selection for your room', 400);
    }
    equipment = eq._id;
  }

  const request_code = await generateRequestCode();
  const doc = await MaintenanceRequest.create({
    request_code,
    student: student._id,
    room: roomId,
    bed: bedId,
    equipment,
    issue_type,
    priority,
    description,
    evidence_urls,
    status: 'pending',
  });

  const managers = await User.find({ role: 'manager', is_active: true }).select('_id').lean();
  if (managers.length > 0) {
    await Notification.insertMany(
      managers.map((m) => ({
        user: m._id,
        title: 'New maintenance request',
        message: `${request_code}: ${issue_type} — ${description.slice(0, 100)}`,
        notification_type: priority === 'urgent' ? 'warning' : 'info',
        category: 'maintenance',
        related_id: doc._id.toString(),
      }))
    );
  }

  const populated = await MaintenanceRequest.findById(doc._id)
    .populate(populateRoomPath)
    .populate(populateBedPath)
    .populate({
      path: 'equipment',
      select: 'equipment_code template',
      populate: { path: 'template', select: 'equipment_name brand model' },
    })
    .lean();
  return { ...populated, id: populated._id };
};

/** Student: equipment rows in assigned room (for optional picker on report form) */
const getMyRoomEquipment = async (userId) => {
  const student = await resolveStudent(userId);
  const { roomId } = await getActiveContractRoomId(student._id);
  const list = await RoomEquipment.find({ room: roomId })
    .populate({ path: 'template', select: 'equipment_name brand model' })
    .select('equipment_code template quantity status')
    .lean();
  return list.map((e) => ({ ...e, id: e._id }));
};

/**
 * Student: maintenance context (student profile + active room + bed)
 * Used to show read-only info on the student maintenance request form.
 */
const getMyMaintenanceContext = async (userId) => {
  const student = await resolveStudent(userId);

  const contract = await Contract.findOne({
    student: student._id,
    status: 'active',
  })
    .populate(populateRoomPath)
    .populate(populateBedPath)
    .lean();

  if (!contract?.room || !contract?.bed) {
    throw new AppError('You do not have an active room assignment (room/bed).', 400);
  }

  return {
    student: {
      full_name: student.full_name,
      student_code: student.student_code,
    },
    room: contract.room,
    bed: {
      bed_number: contract.bed.bed_number,
    },
  };
};

const getMyMaintenanceRequests = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) return [];

  const list = await MaintenanceRequest.find({ student: student._id })
    .populate(populateRoomPath)
    .populate(populateBedPath)
    .populate({
      path: 'equipment',
      select: 'equipment_code template',
      populate: { path: 'template', select: 'equipment_name brand model' },
    })
    .sort({ requested_at: -1 })
    .lean();

  return list.map((r) => ({ ...r, id: r._id }));
};

const getAllMaintenanceRequests = async (query = {}) => {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;

  const items = await MaintenanceRequest.find(filter)
    .populate({
      path: 'student',
      select: 'full_name student_code',
      populate: { path: 'user', select: 'email' },
    })
    .populate(populateRoomPath)
    .populate(populateBedPath)
    .populate({
      path: 'equipment',
      select: 'equipment_code template',
      populate: { path: 'template', select: 'equipment_name brand model' },
    })
    .sort({ requested_at: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await MaintenanceRequest.countDocuments(filter);
  return {
    data: items.map((i) => ({ ...i, id: i._id })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

const notifyStudentMaintenanceUpdate = async (reqDoc, message) => {
  const stu = await Student.findById(reqDoc.student).select('user').lean();
  if (!stu?.user) return;
  await Notification.create({
    user: stu.user,
    title: 'Maintenance request updated',
    message,
    notification_type: reqDoc.status === 'rejected' ? 'warning' : 'info',
    category: 'maintenance',
    related_id: reqDoc._id.toString(),
  });
};

/**
 * Manager: update status (and optional fields)
 */
const reviewMaintenanceRequest = async (requestId, managerUserId, body) => {
  const req = await MaintenanceRequest.findById(requestId);
  if (!req) throw new AppError('Maintenance request not found', 404);

  const terminal = ['completed', 'done', 'cannot_fix', 'cancelled', 'rejected'];
  if (terminal.includes(req.status)) {
    throw new AppError('This maintenance request is closed and cannot be edited', 409);
  }

  const nextStatus = String(body?.status || '').trim();
  const allowed = [
    'approved',
    'rejected',
    'assigned',
    'in_progress',
    'waiting_parts',
    'completed',
    'done',
    'need_rework',
    'cannot_fix',
    'cancelled',
  ];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(`status must be one of: ${allowed.join(', ')}`, 400);
  }
  if (nextStatus === 'rejected' && !String(body?.rejection_reason || '').trim()) {
    throw new AppError('rejection_reason is required when status is rejected', 400);
  }

  const staff = await Staff.findOne({ user: managerUserId }).select('_id').lean();

  req.status = nextStatus;
  req.reviewed_at = new Date();
  req.reviewed_by = staff?._id || null;
  req.rejection_reason = nextStatus === 'rejected' ? String(body.rejection_reason).trim() : null;
  if (body?.technician_name != null) req.technician_name = String(body.technician_name).trim() || null;
  if (body?.technician_phone != null) req.technician_phone = String(body.technician_phone).trim() || null;
  if (body?.scheduled_time != null) {
    const d = new Date(body.scheduled_time);
    if (Number.isNaN(d.getTime())) {
      throw new AppError('scheduled_time must be a valid date', 400);
    }
    req.scheduled_time = d;
  }
  if (body?.completion_notes != null) req.completion_notes = String(body.completion_notes).trim() || null;
  if (['completed', 'done'].includes(nextStatus)) {
    req.completed_at = new Date();
  }

  await req.save();

  let msg = `${req.request_code} status: ${nextStatus}.`;
  if (nextStatus === 'rejected' && req.rejection_reason) {
    msg += ` Reason: ${req.rejection_reason}`;
  }
  if (req.completion_notes) {
    msg += ` Notes: ${req.completion_notes}`;
  }
  await notifyStudentMaintenanceUpdate(req, msg);

  const populated = await MaintenanceRequest.findById(req._id)
    .populate({
      path: 'student',
      select: 'full_name student_code',
    })
    .populate(populateRoomPath)
    .populate(populateBedPath)
    .populate({
      path: 'equipment',
      select: 'equipment_code template',
      populate: { path: 'template', select: 'equipment_name brand model' },
    })
    .lean();

  return { ...populated, id: populated._id };
};

module.exports = {
  createMaintenanceRequest,
  getMyMaintenanceContext,
  getMyRoomEquipment,
  getMyMaintenanceRequests,
  getAllMaintenanceRequests,
  reviewMaintenanceRequest,
};
