const {
  RoomTransferRequest,
  Student,
  Contract,
  Bed,
  Room,
  Staff,
  BedTransferHistory,
  BookingRequest,
  Invoice,
  Payment,
  User,
  Notification,
} = require('../models');
const AppError = require('../utils/AppError');
const {
  createPayosPaymentLink,
  getPayosPaymentInfo,
  cancelPayosPaymentLink,
} = require('./payos.service');

const OPEN_STATUSES = [
  'pending_partner',
  'pending_manager',
  'pending_payment_upgrade',
  'pending_refund_office',
];

const PAYMENT_HOLD_MS = 10 * 60 * 1000;
const REFUND_WINDOW_MS = 36 * 60 * 60 * 1000;

const isPayosPaid = (info) => {
  const st = String(info?.status || info?.data?.status || info?.paymentStatus || '').toLowerCase();
  return st === 'paid' || st === 'success' || st === 'completed';
};

const isInSemester = (contract) => {
  if (!contract?.start_date || !contract?.end_date) return false;
  const now = new Date();
  return now >= new Date(contract.start_date) && now <= new Date(contract.end_date);
};

const isBeforeSemesterStart = (contract) => {
  if (!contract?.start_date) return false;
  return new Date() < new Date(contract.start_date);
};

const getRoomPrice = async (roomId) => {
  const room = await Room.findById(roomId).select('price_per_semester').lean();
  return room ? Number(room.price_per_semester) || 0 : 0;
};

const generateSupplementInvoiceCode = async () => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `TRUP-${dateStr}-`;
  const lastInvoice = await Invoice.findOne({ invoice_code: { $regex: `^${prefix}` } })
    .sort({ invoice_code: -1 })
    .lean();
  let seq = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(String(lastInvoice.invoice_code).split('-').pop(), 10);
    seq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/** PayOS orderCode must fit in 32-bit signed int for some gateways; keep unique in Payment collection. */
const allocateTransferUpgradePayosOrderCode = async () => {
  const cap = 2000000000;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = Math.floor(Math.random() * (cap - 1)) + 1;
    const taken = await Payment.exists({ payos_order_code: candidate });
    if (!taken) return candidate;
  }
  return Math.floor(Date.now() / 1000) % cap || 1;
};

const notifyStudentUser = async (studentId, title, message, notificationType = 'info') => {
  const st = await Student.findById(studentId).select('user').lean();
  if (!st?.user) return;
  await Notification.create({
    user: st.user,
    title,
    message,
    notification_type: notificationType,
    category: 'general',
  });
};

/** Alert all active managers: student moved to cheaper bed — refund must be handled at office. */
const notifyManagersBedTransferRefundOffice = async (reqDoc, refundDeadline) => {
  const managers = await User.find({ role: 'manager', is_active: true }).select('_id').lean();
  if (!managers.length) return;
  const st = await Student.findById(reqDoc.initiator_student).select('full_name student_code').lean();
  const name = st?.full_name || 'Student';
  const code = st?.student_code || '';
  const deadlineStr = refundDeadline
    ? new Date(refundDeadline).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '';
  const message = [
    `Sinh viên ${name} (${code}) đã được chuyển sang giường/phòng có giá thấp hơn.`,
    `Mã yêu cầu: ${reqDoc.request_code}.`,
    'Cần xử lý hoàn tiền tại văn phòng khi sinh viên lên.',
    deadlineStr ? `Hạn sinh viên lên: ${deadlineStr}.` : '',
    'Sau khi hoàn tiền xong, bấm "Refund processed" trên đơn đổi giường để hoàn tất.',
  ]
    .filter(Boolean)
    .join(' ');

  await Notification.insertMany(
    managers.map((m) => ({
      user: m._id,
      title: 'Đổi giường: chờ hoàn tiền tại văn phòng',
      message,
      notification_type: 'warning',
      category: 'general',
    }))
  );
};

const generateRequestCode = async (maxRetries = 5) => {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const prefix = `TR-${dateStr}-`;

  for (let i = 0; i < maxRetries; i++) {
    const last = await RoomTransferRequest.findOne({
      request_code: { $regex: `^${prefix}` },
    }).sort({ request_code: -1 });
    let seq = 1;
    if (last) {
      const parts = String(last.request_code).split('-');
      const lastSeq = Number(parts[parts.length - 1]);
      seq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
    }
    const code = `${prefix}${String(seq).padStart(4, '0')}`;
    const exists = await RoomTransferRequest.findOne({ request_code: code }).lean();
    if (!exists) return code;
  }

  return `${prefix}${Date.now().toString().slice(-4)}`;
};

const getStudentByUser = async (userId) => {
  const student = await Student.findOne({ user: userId });
  if (!student) throw new AppError('Only students can create bed transfer requests', 403);
  return student;
};

const getActiveContract = async (studentId, opts = {}) => {
  const { subject = 'self', studentCode = '' } = opts;
  const contract = await Contract.findOne({
    student: studentId,
    status: { $in: ['active', 'extended'] },
  });
  if (!contract?.bed || !contract?.room) {
    if (subject === 'target') {
      throw new AppError(
        `Sinh viên ${studentCode || ''} chưa có giường ở ký túc xá nên chưa thể đổi chéo.`.trim(),
        403
      );
    }
    throw new AppError('Bạn chưa có giường ở ký túc xá nên không thể gửi đơn đổi giường.', 403);
  }
  return contract;
};

const syncRoomAvailability = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) return;
  const availableCount = await Bed.countDocuments({ room: roomId, status: 'available' });
  room.available_beds = availableCount;

  const occupiedCount = await Bed.countDocuments({ room: roomId, status: 'occupied' });
  if (occupiedCount === room.total_beds) room.status = 'full';
  else if (room.status === 'full') room.status = 'available';

  await room.save();
};

const syncCurrentBookingBedSnapshot = async (studentId, roomId, bedId, semester) => {
  const now = new Date();
  const booking = await BookingRequest.findOne({
    student: studentId,
    status: 'approved',
    checkout_date: null,
    ...(semester ? { semester } : {}),
    $or: [{ end_date: { $exists: false } }, { end_date: { $gt: now } }],
  }).sort({ requested_at: -1 });

  if (!booking) return;
  booking.bed_transfer = bedId;
  await booking.save();
};

const ensureNoOpenRequest = async (studentId) => {
  const exists = await RoomTransferRequest.findOne({
    initiator_student: studentId,
    status: { $in: OPEN_STATUSES },
  }).lean();
  if (exists) {
    throw new AppError('Bạn đang có một đơn đổi giường chưa xử lý.', 409);
  }
};

const createEmptyBedTransferRequest = async (userId, body) => {
  const student = await getStudentByUser(userId);
  const myContract = await getActiveContract(student._id, { subject: 'self' });
  await ensureNoOpenRequest(student._id);

  const targetBedId = body?.requested_bed_id;
  const reason = String(body?.reason || '').trim();
  if (!targetBedId) throw new AppError('requested_bed_id is required', 400);
  if (!reason) throw new AppError('reason is required', 400);

  const now = new Date();
  if (now > new Date(myContract.end_date)) {
    throw new AppError('Your contract semester has ended; bed transfer is not available.', 403);
  }

  const targetBed = await Bed.findById(targetBedId);
  if (!targetBed) throw new AppError('Requested bed not found', 404);
  if (String(targetBed._id) === String(myContract.bed)) {
    throw new AppError('Requested bed must be different from current bed', 400);
  }
  if (targetBed.status !== 'available') {
    throw new AppError('Requested bed is no longer available', 409);
  }

  const [currentPrice, targetPrice] = await Promise.all([
    Promise.resolve(Number(myContract.room_price) || 0),
    getRoomPrice(targetBed.room),
  ]);

  let priceAdjustmentType = 'none';
  if (isInSemester(myContract)) {
    if (targetPrice !== currentPrice) {
      throw new AppError(
        'During the semester you may only move to a bed with the same room price as your current bed.',
        400
      );
    }
    priceAdjustmentType = 'none';
  } else if (isBeforeSemesterStart(myContract)) {
    if (targetPrice > currentPrice) priceAdjustmentType = 'upgrade';
    else if (targetPrice < currentPrice) priceAdjustmentType = 'downgrade';
    else priceAdjustmentType = 'none';
  } else {
    if (targetPrice !== currentPrice) {
      throw new AppError(
        'Outside the pre-semester booking window, only same-price bed changes are allowed. Contact management.',
        400
      );
    }
  }

  const request = await RoomTransferRequest.create({
    request_code: await generateRequestCode(),
    transfer_type: 'target_empty',
    initiator_student: student._id,
    current_room: myContract.room,
    current_bed: myContract.bed,
    requested_room: targetBed.room,
    requested_bed: targetBed._id,
    reason,
    status: 'pending_manager',
    price_adjustment_type: priceAdjustmentType,
    supplement_amount: Math.max(0, targetPrice - currentPrice),
  });

  return getTransferRequestById(request._id);
};

const createSwapTransferRequest = async (userId, body) => {
  const student = await getStudentByUser(userId);
  const myContract = await getActiveContract(student._id, { subject: 'self' });
  await ensureNoOpenRequest(student._id);

  if (!isInSemester(myContract)) {
    throw new AppError(
      'Bed swaps are only allowed during the active semester (same-price swap with another student).',
      403
    );
  }

  const targetStudentCode = String(body?.target_student_code || '').trim();
  const reason = String(body?.reason || '').trim();
  if (!targetStudentCode) throw new AppError('target_student_code is required', 400);
  if (!reason) throw new AppError('reason is required', 400);

  const targetStudent = await Student.findOne({
    student_code: { $regex: new RegExp(`^${targetStudentCode}$`, 'i') },
  });
  if (!targetStudent) throw new AppError('Target student not found', 404);
  if (String(targetStudent._id) === String(student._id)) {
    throw new AppError('Bạn không thể tự đổi chéo với chính mình.', 400);
  }

  const targetContract = await getActiveContract(targetStudent._id, {
    subject: 'target',
    studentCode: targetStudent.student_code,
  });

  if (!isInSemester(targetContract)) {
    throw new AppError('The other student is not in an active semester stay; swap is not available.', 403);
  }

  const [myPrice, theirPrice] = await Promise.all([
    Promise.resolve(Number(myContract.room_price) || 0),
    Promise.resolve(Number(targetContract.room_price) || 0),
  ]);
  if (myPrice !== theirPrice) {
    throw new AppError(
      'You can only swap with a student whose bed has the same room price as yours.',
      400
    );
  }

  if (String(targetContract.bed) === String(myContract.bed)) {
    throw new AppError('Hai sinh viên đang ở cùng một giường.', 400);
  }

  const existsIncoming = await RoomTransferRequest.findOne({
    transfer_type: 'swap',
    target_student: targetStudent._id,
    status: 'pending_partner',
  }).lean();
  if (existsIncoming) {
    throw new AppError('Sinh viên này đang có yêu cầu đổi chéo chờ xác nhận.', 409);
  }

  const request = await RoomTransferRequest.create({
    request_code: await generateRequestCode(),
    transfer_type: 'swap',
    initiator_student: student._id,
    target_student: targetStudent._id,
    current_room: myContract.room,
    current_bed: myContract.bed,
    requested_room: targetContract.room,
    requested_bed: targetContract.bed,
    reason,
    status: 'pending_partner',
  });

  return getTransferRequestById(request._id);
};

const getSwapTargetPreview = async (userId, studentCode) => {
  const me = await getStudentByUser(userId);
  const myContract = await getActiveContract(me._id, { subject: 'self' });
  const targetStudentCode = String(studentCode || '').trim();
  if (!targetStudentCode) throw new AppError('student_code is required', 400);

  const targetStudent = await Student.findOne({
    student_code: { $regex: new RegExp(`^${targetStudentCode}$`, 'i') },
  }).select('student_code full_name');
  if (!targetStudent) throw new AppError('Target student not found', 404);
  if (String(targetStudent._id) === String(me._id)) {
    throw new AppError('Bạn không thể tự đổi chéo với chính mình.', 400);
  }

  const targetContract = await getActiveContract(targetStudent._id, {
    subject: 'target',
    studentCode: targetStudent.student_code,
  });

  const [bed, room] = await Promise.all([
    Bed.findById(targetContract.bed).select('bed_number'),
    Room.findById(targetContract.room)
      .select('room_number block price_per_semester')
      .populate({
        path: 'block',
        select: 'block_name block_code dorm',
        populate: { path: 'dorm', select: 'dorm_code dorm_name' },
      }),
  ]);

  return {
    student: {
      id: targetStudent._id,
      student_code: targetStudent.student_code,
      full_name: targetStudent.full_name,
    },
    room,
    bed,
    room_price: room ? Number(room.price_per_semester) : undefined,
    initiator_room_price: Number(myContract.room_price) || undefined,
    swap_allowed:
      isInSemester(myContract) &&
      isInSemester(targetContract) &&
      Number(myContract.room_price) === Number(targetContract.room_price),
  };
};

const populateTransfer = async (query) => {
  return query.populate([
    {
      path: 'initiator_student',
      select: 'student_code full_name phone user',
      populate: { path: 'user', select: 'email' },
    },
    {
      path: 'target_student',
      select: 'student_code full_name phone user',
      populate: { path: 'user', select: 'email' },
    },
    {
      path: 'current_room',
      select: 'room_number block',
      populate: { path: 'block', select: 'block_name block_code dorm', populate: { path: 'dorm', select: 'dorm_code dorm_name' } },
    },
    { path: 'current_bed', select: 'bed_number status' },
    {
      path: 'requested_room',
      select: 'room_number block',
      populate: { path: 'block', select: 'block_name block_code dorm', populate: { path: 'dorm', select: 'dorm_code dorm_name' } },
    },
    { path: 'requested_bed', select: 'bed_number status' },
    { path: 'reviewed_by', select: 'full_name staff_code' },
    { path: 'supplement_invoice', select: 'invoice_code total_amount payment_status' },
  ]);
};

const getTransferRequestById = async (id) => {
  const doc = await populateTransfer(RoomTransferRequest.findById(id));
  if (!doc) throw new AppError('Transfer request not found', 404);
  return doc;
};

const getMyTransferHistory = async (userId) => {
  const student = await getStudentByUser(userId);
  return BedTransferHistory.find({ student: student._id })
    .populate([
      {
        path: 'from_room',
        select: 'room_number block',
        populate: { path: 'block', select: 'block_name block_code dorm', populate: { path: 'dorm', select: 'dorm_code dorm_name' } },
      },
      { path: 'from_bed', select: 'bed_number' },
      {
        path: 'to_room',
        select: 'room_number block',
        populate: { path: 'block', select: 'block_name block_code dorm', populate: { path: 'dorm', select: 'dorm_code dorm_name' } },
      },
      { path: 'to_bed', select: 'bed_number' },
      { path: 'changed_by_staff', select: 'full_name staff_code' },
      { path: 'transfer_request', select: 'request_code transfer_type status' },
    ])
    .sort({ changed_at: -1 });
};

const getMyTransferRequests = async (userId) => {
  await processRoomTransferTimeouts();
  const student = await getStudentByUser(userId);
  return populateTransfer(
    RoomTransferRequest.find({
      $or: [{ initiator_student: student._id }, { target_student: student._id }],
    }).sort({ requested_at: -1 })
  );
};

const getAvailableBedsForTransfer = async (userId) => {
  const student = await getStudentByUser(userId);
  const myContract = await getActiveContract(student._id, { subject: 'self' });
  const now = new Date();
  if (now > new Date(myContract.end_date)) {
    return [];
  }

  const currentPrice = Number(myContract.room_price) || 0;
  const inSem = isInSemester(myContract);
  const beforeStart = isBeforeSemesterStart(myContract);

  const beds = await Bed.find({ status: 'available' })
    .populate({
      path: 'room',
      select: 'room_number block price_per_semester',
      populate: { path: 'block', select: 'block_name block_code dorm', populate: { path: 'dorm', select: 'dorm_code dorm_name' } },
    })
    .select('bed_number room status')
    .sort({ updatedAt: -1 })
    .limit(400)
    .lean();

  const filtered = beds.filter((b) => {
    if (String(b._id) === String(myContract.bed)) return false;
    const tp = Number(b.room?.price_per_semester);
    if (inSem) return tp === currentPrice;
    if (beforeStart) return true;
    return tp === currentPrice;
  });

  return filtered.map((b) => ({
    id: b._id,
    bed_number: b.bed_number,
    status: b.status,
    room: b.room,
    room_price: b.room ? Number(b.room.price_per_semester) : undefined,
  }));
};

const respondSwapTransferRequest = async (userId, requestId, body) => {
  const student = await getStudentByUser(userId);
  const req = await RoomTransferRequest.findById(requestId);
  if (!req) throw new AppError('Transfer request not found', 404);
  if (req.transfer_type !== 'swap') throw new AppError('Only swap requests can be responded by partner', 400);
  if (req.status !== 'pending_partner') throw new AppError('This request is not waiting for partner response', 409);
  if (String(req.target_student) !== String(student._id)) {
    throw new AppError('You are not the target student of this request', 403);
  }

  const accept = Boolean(body?.accept);
  req.partner_response_at = new Date();
  if (accept) {
    req.status = 'pending_manager';
    req.rejection_reason = null;
  } else {
    req.status = 'rejected';
    req.rejection_reason = String(body?.reason || 'Target student rejected swap').trim();
  }
  await req.save();
  return getTransferRequestById(req._id);
};

const cancelTransferRequest = async (userId, requestId) => {
  const student = await getStudentByUser(userId);
  const req = await RoomTransferRequest.findById(requestId);
  if (!req) throw new AppError('Transfer request not found', 404);
  if (String(req.initiator_student) !== String(student._id)) {
    throw new AppError('You can only cancel your own request', 403);
  }
  if (req.status === 'pending_payment_upgrade' || req.status === 'pending_refund_office') {
    throw new AppError('This transfer cannot be cancelled from the app. Contact dormitory management.', 409);
  }
  if (!['pending_partner', 'pending_manager'].includes(req.status)) {
    throw new AppError('Only pending requests can be cancelled', 409);
  }
  req.status = 'cancelled';
  await req.save();
  return { message: 'Transfer request cancelled' };
};

const getAllTransferRequests = async (query = {}) => {
  await processRoomTransferTimeouts();
  const { status, transfer_type, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;
  if (transfer_type) filter.transfer_type = transfer_type;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    populateTransfer(
      RoomTransferRequest.find(filter).sort({ requested_at: -1 }).skip(skip).limit(Number(limit))
    ),
    RoomTransferRequest.countDocuments(filter),
  ]);

  return {
    data: items,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

const executeTargetEmptyTransfer = async (req, { allowReservedTarget = false } = {}) => {
  const contract = await getActiveContract(req.initiator_student);
  const sourceBed = await Bed.findById(contract.bed);
  const targetBed = await Bed.findById(req.requested_bed);
  if (!sourceBed || !targetBed) throw new AppError('Bed not found for transfer execution', 404);
  const okStatus = allowReservedTarget
    ? targetBed.status === 'available' || targetBed.status === 'reserved'
    : targetBed.status === 'available';
  if (!okStatus) throw new AppError('Requested bed is no longer available', 409);

  const newRoom = await Room.findById(targetBed.room).select('price_per_semester').lean();
  if (newRoom) {
    contract.room_price = Number(newRoom.price_per_semester) || contract.room_price;
  }

  contract.bed = targetBed._id;
  contract.room = targetBed.room;
  await contract.save();
  await syncCurrentBookingBedSnapshot(contract.student, targetBed.room, targetBed._id, contract.semester);

  sourceBed.status = 'available';
  targetBed.status = 'occupied';
  await Promise.all([sourceBed.save(), targetBed.save()]);
  await Promise.all([syncRoomAvailability(sourceBed.room), syncRoomAvailability(targetBed.room)]);

  await BedTransferHistory.create({
    student: contract.student,
    from_room: sourceBed.room,
    from_bed: sourceBed._id,
    to_room: targetBed.room,
    to_bed: targetBed._id,
    transfer_source: 'transfer_request_empty',
    transfer_request: req._id,
    changed_by_staff: req.reviewed_by || null,
    note: 'Approved transfer request to empty bed',
  });
};

const revertDowngradeAfterRefundTimeout = async (reqDoc) => {
  const contract = await getActiveContract(reqDoc.initiator_student);
  const targetBed = await Bed.findById(reqDoc.requested_bed);
  const sourceBed = await Bed.findById(reqDoc.current_bed);
  if (!targetBed || !sourceBed) return;

  if (String(contract.bed) !== String(targetBed._id)) return;

  const oldRoom = await Room.findById(reqDoc.current_room).select('price_per_semester').lean();
  contract.bed = reqDoc.current_bed;
  contract.room = reqDoc.current_room;
  if (oldRoom) contract.room_price = Number(oldRoom.price_per_semester) || contract.room_price;
  await contract.save();
  await syncCurrentBookingBedSnapshot(
    contract.student,
    reqDoc.current_room,
    reqDoc.current_bed,
    contract.semester
  );

  targetBed.status = 'available';
  sourceBed.status = 'occupied';
  await Promise.all([targetBed.save(), sourceBed.save()]);
  await Promise.all([syncRoomAvailability(targetBed.room), syncRoomAvailability(sourceBed.room)]);
};

// During downgrade refund window, keep student's old bed locked to avoid being booked by others.
const holdDowngradeOldBed = async (reqDoc) => {
  const oldBed = await Bed.findById(reqDoc.current_bed);
  if (!oldBed) return;
  if (oldBed.status === 'occupied') return;
  oldBed.status = 'reserved';
  await oldBed.save();
  await syncRoomAvailability(oldBed.room);
};

const releaseDowngradeOldBedHold = async (reqDoc) => {
  const oldBed = await Bed.findById(reqDoc.current_bed);
  if (!oldBed || oldBed.status !== 'reserved') return;
  oldBed.status = 'available';
  await oldBed.save();
  await syncRoomAvailability(oldBed.room);
};

const releaseUpgradeReservedBed = async (reqDoc) => {
  const targetBed = await Bed.findById(reqDoc.requested_bed);
  if (!targetBed || targetBed.status !== 'reserved') return;
  targetBed.status = 'available';
  await targetBed.save();
  await syncRoomAvailability(targetBed.room);
};

const cancelSupplementPayosBestEffort = async (invoiceId) => {
  const pay = await Payment.findOne({
    invoice: invoiceId,
    payment_method: 'payos',
    payment_status: 'pending',
  }).lean();
  if (pay?.payos_order_code) {
    await cancelPayosPaymentLink(pay.payos_order_code, 'Room transfer upgrade payment expired');
    await Payment.updateOne({ _id: pay._id }, { $set: { payment_status: 'expired' } });
  }
  if (invoiceId) {
    await Invoice.findByIdAndUpdate(invoiceId, { $set: { payment_status: 'cancelled' } });
  }
};

const startUpgradePaymentAfterApprove = async (reqDoc, managerUserId) => {
  const staff = await Staff.findOne({ user: managerUserId }).select('_id');
  const contract = await getActiveContract(reqDoc.initiator_student);
  const amountRaw = Math.max(0, Number(reqDoc.supplement_amount) || 0);
  const amount = Math.round(amountRaw);
  if (amount <= 0) throw new AppError('Invalid supplement amount for upgrade', 400);

  const invoiceMonth = contract.semester != null ? String(contract.semester).trim() : '';
  if (!invoiceMonth) {
    throw new AppError('Contract is missing semester; cannot create supplement invoice for upgrade.', 500);
  }

  const targetBed = await Bed.findById(reqDoc.requested_bed);
  if (!targetBed || targetBed.status !== 'available') {
    throw new AppError('Requested bed is no longer available for upgrade hold', 409);
  }

  targetBed.status = 'reserved';
  await targetBed.save();
  await syncRoomAvailability(targetBed.room);

  const returnUrl = process.env.PAYOS_RETURN_URL;
  const cancelUrl = process.env.PAYOS_CANCEL_URL;
  if (!returnUrl || !cancelUrl) {
    await releaseUpgradeReservedBed(reqDoc);
    throw new AppError(
      'Online payment is not configured (missing PAYOS_RETURN_URL / PAYOS_CANCEL_URL). Cannot approve upgrade.',
      503
    );
  }

  const invoice_code = await generateSupplementInvoiceCode();
  let invoice = null;

  try {
    invoice = await Invoice.create({
      invoice_code,
      student: contract.student,
      room: targetBed.room,
      invoice_month: invoiceMonth,
      room_fee: amount,
      electricity_fee: 0,
      water_fee: 0,
      service_fee: 0,
      total_amount: amount,
      payment_status: 'unpaid',
      due_date: contract.start_date || new Date(),
    });

    const orderCode = await allocateTransferUpgradePayosOrderCode();
    const buyer = await User.findById(
      (await Student.findById(contract.student).select('user').lean())?.user
    )
      .select('email full_name')
      .lean();

    const paymentLink = await createPayosPaymentLink({
      orderCode,
      amount,
      description: String(invoice_code).slice(0, 240),
      returnUrl,
      cancelUrl,
      buyerEmail: buyer?.email,
      buyerName: buyer?.full_name || undefined,
      items: [{ name: `Bed upgrade ${invoice_code}`, quantity: 1, price: amount }],
    });
    const payosPaymentLinkId = paymentLink?.paymentLinkId || paymentLink?.id || null;
    const payosCheckoutUrl = paymentLink?.checkoutUrl || paymentLink?.checkout_url || null;
    const payosQrCode = paymentLink?.qrCode || paymentLink?.qr_code || null;
    await Payment.create({
      transaction_code: `PAYOS-TR-${orderCode}-${invoice._id}`,
      payos_order_code: orderCode,
      payos_payment_link_id: payosPaymentLinkId,
      payos_checkout_url: payosCheckoutUrl,
      payos_qr_code: payosQrCode,
      invoice: invoice._id,
      student: contract.student,
      amount,
      payment_method: 'payos',
      payment_status: 'pending',
      transaction_details: paymentLink || null,
    });

    const payosPayload = {
      orderCode,
      paymentLinkId: payosPaymentLinkId,
      checkoutUrl: payosCheckoutUrl,
      qrCode: payosQrCode,
    };

    reqDoc.supplement_invoice = invoice._id;
    reqDoc.payment_deadline = new Date(Date.now() + PAYMENT_HOLD_MS);
    reqDoc.status = 'pending_payment_upgrade';
    reqDoc.reviewed_by = staff?._id || null;
    reqDoc.reviewed_at = new Date();
    await reqDoc.save();

    await notifyStudentUser(
      reqDoc.initiator_student,
      'Bed upgrade payment required',
      `Your bed change was approved. Pay the price difference within 10 minutes using the payment link in the booking/transfer screen. Request ${reqDoc.request_code}.`,
      'warning'
    );

    return { payos: payosPayload, invoice: { id: invoice._id, invoice_code, total_amount: amount } };
  } catch (e) {
    await releaseUpgradeReservedBed(reqDoc);
    if (invoice?._id) {
      await Payment.deleteMany({ invoice: invoice._id });
      await Invoice.findByIdAndDelete(invoice._id);
    }
    if (e instanceof AppError || e?.name === 'AppError') throw e;
    const payosHttp = Number(e?.status);
    let statusCode = 500;
    if (payosHttp >= 400 && payosHttp < 600) statusCode = payosHttp;
    else if (e?.name === 'APIError' || e?.name === 'PayOSError') statusCode = 502;
    throw new AppError(
      e?.message || 'Failed to create supplement invoice or PayOS payment for bed upgrade',
      statusCode
    );
  }
};

const finalizeApprovedUpgradeTransfer = async (reqDoc) => {
  await executeTargetEmptyTransfer(reqDoc, { allowReservedTarget: true });
  reqDoc.status = 'approved';
  await reqDoc.save();
  await notifyStudentUser(
    reqDoc.initiator_student,
    'Bed change complete',
    `Payment received. You have been moved to the new bed. Request ${reqDoc.request_code}.`,
    'success'
  );
};

const processRoomTransferTimeouts = async () => {
  const now = new Date();

  const expiredUpgrades = await RoomTransferRequest.find({
    status: 'pending_payment_upgrade',
    payment_deadline: { $lt: now },
  });

  for (const r of expiredUpgrades) {
    await cancelSupplementPayosBestEffort(r.supplement_invoice);
    await releaseUpgradeReservedBed(r);
    r.status = 'cancelled';
    r.rejection_reason = 'Upgrade payment not completed within 10 minutes';
    await r.save();
    await notifyStudentUser(
      r.initiator_student,
      'Bed upgrade cancelled',
      `The bed change request ${r.request_code} was cancelled because payment was not completed in time. You remain on your previous bed.`,
      'warning'
    );
  }

  const expiredRefunds = await RoomTransferRequest.find({
    status: 'pending_refund_office',
    refund_deadline: { $lt: now },
  });

  for (const r of expiredRefunds) {
    await revertDowngradeAfterRefundTimeout(r);
    r.status = 'cancelled';
    r.rejection_reason = 'Refund office visit not completed within 36 hours';
    await r.save();
    await notifyStudentUser(
      r.initiator_student,
      'Bed change reverted',
      `Request ${r.request_code}: you did not complete the in-office refund step in time. You have been moved back to your previous bed.`,
      'warning'
    );
  }
};

const checkTransferSupplementPayment = async (requestId, userId) => {
  await processRoomTransferTimeouts();
  const student = await getStudentByUser(userId);
  const reqDoc = await RoomTransferRequest.findById(requestId);
  if (!reqDoc) throw new AppError('Transfer request not found', 404);
  if (String(reqDoc.initiator_student) !== String(student._id)) {
    throw new AppError('Forbidden', 403);
  }
  if (reqDoc.status !== 'pending_payment_upgrade') {
    const t = await getTransferRequestById(reqDoc._id);
    return {
      transfer: t,
      status: reqDoc.status,
      paid: reqDoc.status === 'approved',
    };
  }

  const invoice = await Invoice.findById(reqDoc.supplement_invoice);
  if (!invoice) throw new AppError('Supplement invoice not found', 404);

  const payment = await Payment.findOne({ invoice: invoice._id, payment_method: 'payos' });
  if (!payment?.payos_order_code) {
    return { transfer: await getTransferRequestById(reqDoc._id), status: 'pending', paid: false };
  }

  if (new Date() > new Date(reqDoc.payment_deadline)) {
    await processRoomTransferTimeouts();
    return { transfer: await getTransferRequestById(reqDoc._id), status: 'expired', paid: false };
  }

  const payosInfo = await getPayosPaymentInfo(payment.payos_order_code);
  if (!isPayosPaid(payosInfo)) {
    return {
      transfer: await getTransferRequestById(reqDoc._id),
      status: 'pending',
      paid: false,
      payos: {
        orderCode: payment.payos_order_code,
        checkoutUrl: payment.payos_checkout_url,
        qrCode: payment.payos_qr_code,
      },
    };
  }

  payment.payment_status = 'completed';
  payment.paid_at = new Date();
  payment.transaction_details = payosInfo;
  await payment.save();
  invoice.payment_status = 'paid';
  invoice.paid_at = new Date();
  await invoice.save();

  await finalizeApprovedUpgradeTransfer(reqDoc);

  return {
    transfer: await getTransferRequestById(reqDoc._id),
    status: 'paid',
    paid: true,
  };
};

const confirmRefundProcessed = async (requestId, managerUserId) => {
  await processRoomTransferTimeouts();
  const reqDoc = await RoomTransferRequest.findById(requestId);
  if (!reqDoc) throw new AppError('Transfer request not found', 404);
  if (reqDoc.status !== 'pending_refund_office') {
    throw new AppError('Only refund-pending transfers can be confirmed', 409);
  }
  const staff = await Staff.findOne({ user: managerUserId }).select('_id');
  await releaseDowngradeOldBedHold(reqDoc);
  reqDoc.status = 'approved';
  reqDoc.refund_confirmed_at = new Date();
  if (staff?._id) reqDoc.reviewed_by = staff._id;
  await reqDoc.save();
  await notifyStudentUser(
    reqDoc.initiator_student,
    'Refund completed',
    `Your in-office refund for bed change request ${reqDoc.request_code} has been recorded. The transfer is now fully complete.`,
    'success'
  );
  return getTransferRequestById(reqDoc._id);
};

const executeSwapTransfer = async (req) => {
  const c1 = await getActiveContract(req.initiator_student);
  const c2 = await getActiveContract(req.target_student);

  const [bed1, bed2] = await Promise.all([Bed.findById(c1.bed), Bed.findById(c2.bed)]);
  if (!bed1 || !bed2) throw new AppError('Cannot execute swap because one bed no longer exists', 404);
  if (String(c1.bed) === String(c2.bed)) throw new AppError('Two students are already on the same bed', 409);

  const oldBed1 = c1.bed;
  const oldRoom1 = c1.room;
  const oldBed2 = c2.bed;
  const oldRoom2 = c2.room;
  c1.bed = c2.bed;
  c1.room = c2.room;
  c2.bed = oldBed1;
  c2.room = oldRoom1;
  await Promise.all([c1.save(), c2.save()]);
  await Promise.all([
    syncCurrentBookingBedSnapshot(c1.student, c1.room, c1.bed, c1.semester),
    syncCurrentBookingBedSnapshot(c2.student, c2.room, c2.bed, c2.semester),
  ]);

  bed1.status = 'occupied';
  bed2.status = 'occupied';
  await Promise.all([bed1.save(), bed2.save()]);
  await Promise.all([syncRoomAvailability(bed1.room), syncRoomAvailability(bed2.room)]);

  await BedTransferHistory.insertMany([
    {
      student: c1.student,
      from_room: oldRoom1,
      from_bed: oldBed1,
      to_room: c1.room,
      to_bed: c1.bed,
      transfer_source: 'transfer_request_swap',
      transfer_request: req._id,
      changed_by_staff: req.reviewed_by || null,
      note: 'Approved swap transfer request',
    },
    {
      student: c2.student,
      from_room: oldRoom2,
      from_bed: oldBed2,
      to_room: c2.room,
      to_bed: c2.bed,
      transfer_source: 'transfer_request_swap',
      transfer_request: req._id,
      changed_by_staff: req.reviewed_by || null,
      note: 'Approved swap transfer request',
    },
  ]);
};

const reviewTransferRequest = async (requestId, managerUserId, body) => {
  await processRoomTransferTimeouts();
  const req = await RoomTransferRequest.findById(requestId);
  if (!req) throw new AppError('Transfer request not found', 404);
  if (req.status !== 'pending_manager') {
    throw new AppError('Only manager-pending requests can be reviewed', 409);
  }

  const action = String(body?.action || '').trim();
  const staff = await Staff.findOne({ user: managerUserId }).select('_id');

  if (action === 'reject') {
    req.reviewed_by = staff?._id || null;
    req.reviewed_at = new Date();
    req.status = 'rejected';
    req.rejection_reason = String(body?.rejection_reason || '').trim() || 'Rejected by manager';
    await req.save();
    return getTransferRequestById(req._id);
  }

  if (action !== 'approve') {
    throw new AppError('action must be approve or reject', 400);
  }

  if (req.transfer_type === 'swap') {
    const c1 = await getActiveContract(req.initiator_student);
    const c2 = await getActiveContract(req.target_student);
    if (!isInSemester(c1) || !isInSemester(c2)) {
      throw new AppError(
        'Swap can only be approved while both students are within their active semester period.',
        400
      );
    }
    const p1 = Number(c1.room_price) || 0;
    const p2 = Number(c2.room_price) || 0;
    if (p1 !== p2) {
      throw new AppError('Swap cannot be approved: room prices no longer match.', 400);
    }
    req.reviewed_by = staff?._id || null;
    req.reviewed_at = new Date();
    await executeSwapTransfer(req);
    req.status = 'approved';
    req.rejection_reason = null;
    await req.save();
    return getTransferRequestById(req._id);
  }

  const contract = await getActiveContract(req.initiator_student);
  const targetPrice = await getRoomPrice(req.requested_room);
  const currentPrice = Number(contract.room_price) || 0;

  if (isInSemester(contract) && targetPrice !== currentPrice) {
    throw new AppError(
      'During the semester this request must be for a bed with the same price as the current room. Reject and ask the student to resubmit if needed.',
      400
    );
  }

  const beforeSemester = isBeforeSemesterStart(contract);
  // Recompute from live prices so old/wrong price_adjustment_type cannot skip refund workflow
  const isUpgradeMove = beforeSemester && targetPrice > currentPrice;
  const isDowngradeMove = beforeSemester && targetPrice < currentPrice;

  if (isUpgradeMove) {
    req.price_adjustment_type = 'upgrade';
    req.supplement_amount = Math.max(0, targetPrice - currentPrice);
    const pay = await startUpgradePaymentAfterApprove(req, managerUserId);
    const populated = await getTransferRequestById(req._id);
    return { transfer: populated, payos: pay.payos, supplement: pay.invoice };
  }

  req.reviewed_by = staff?._id || null;
  req.reviewed_at = new Date();

  if (isDowngradeMove) {
    req.price_adjustment_type = 'downgrade';
    await executeTargetEmptyTransfer(req);
    await holdDowngradeOldBed(req);
    req.status = 'pending_refund_office';
    req.refund_deadline = new Date(Date.now() + REFUND_WINDOW_MS);
    req.rejection_reason = null;
    await req.save();
    await notifyStudentUser(
      req.initiator_student,
      'Visit office for refund',
      `Your move to a lower-priced bed is approved. Please visit the dormitory management office within 36 hours to process your refund. Request ${req.request_code}.`,
      'warning'
    );
    await notifyManagersBedTransferRefundOffice(req, req.refund_deadline);
    return getTransferRequestById(req._id);
  }

  await executeTargetEmptyTransfer(req);
  req.status = 'approved';
  req.rejection_reason = null;
  await req.save();
  return getTransferRequestById(req._id);
};

module.exports = {
  createEmptyBedTransferRequest,
  createSwapTransferRequest,
  getSwapTargetPreview,
  getMyTransferRequests,
  getMyTransferHistory,
  getAvailableBedsForTransfer,
  getAllTransferRequests,
  respondSwapTransferRequest,
  cancelTransferRequest,
  reviewTransferRequest,
  getTransferRequestById,
  checkTransferSupplementPayment,
  confirmRefundProcessed,
  processRoomTransferTimeouts,
};
