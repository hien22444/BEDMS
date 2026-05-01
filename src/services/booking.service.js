const {
  BookingRequest,
  Room,
  Bed,
  Block,
  Student,
  User,
  Invoice,
  InvoiceLineItem,
  Payment,
  Contract,
  Notification,
  SystemConfig,
} = require('../models');
const AppError = require('../utils/AppError');
const bedSoftLock = require('../utils/bedSoftLock');
const {
  createPayosPaymentLink,
  getPayosPaymentInfo,
  cancelPayosPaymentLink,
} = require('./payos.service');
const { sendPaymentSuccessEmail, sendMail } = require('./email.service');
const { createCheckoutSettlement } = require('./ewUsage.service');

const invoiceCodeToOrderCode = (invoiceCode) => {
  // BOOK-YYYYMMDD-0005 => 202603060005 (safe integer)
  const m = String(invoiceCode || '').match(/^BOOK-(\d{8})-(\d{4,})$/);
  if (!m) return Number(Date.now()); // fallback
  return Number(`${m[1]}${m[2]}`);
};

const isPayosPaid = (info) => {
  const status = String(
    info?.status || info?.data?.status || info?.paymentStatus || ''
  ).toLowerCase();
  return status === 'paid' || status === 'success' || status === 'completed';
};

const populateBookingForStudent = async (bookingId) => {
  return BookingRequest.findById(bookingId)
    .populate({
      path: 'room',
      populate: { path: 'block', populate: { path: 'dorm', select: 'dorm_name' } },
    })
    .populate('bed', 'bed_number')
    .populate('invoice');
};

// ─── Booking Window Config Keys ───────────────────────────
const BOOKING_CONFIG_KEYS = {
  HOLD_START: 'booking_hold_window_start',
  HOLD_END: 'booking_hold_window_end',
  NEW_START: 'booking_new_window_start',
  NEW_END: 'booking_new_window_end',
};

const isWithinWindow = (now, startStr, endStr) => {
  if (!startStr || !endStr) return false;
  const start = new Date(startStr);
  const end = new Date(endStr);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
};

// ─── Semester Logic ───────────────────────────────────────

// Returns a numeric rank for chronological comparison: higher = later semester
// e.g. Spring-2026 → 20261, Summer-2026 → 20262, Fall-2026 → 20263
const semesterRank = (semesterStr) => {
  const order = { Spring: 1, Summer: 2, Fall: 3 };
  const [name, yearStr] = String(semesterStr || '').split('-');
  const year = parseInt(yearStr, 10);
  if (!order[name] || isNaN(year)) return 0;
  return year * 10 + order[name];
};

const SEMESTER_DATES = {
  Spring: (year) => ({ start_date: new Date(year, 0, 1), end_date: new Date(year, 3, 30) }),
  Summer: (year) => ({ start_date: new Date(year, 4, 1), end_date: new Date(year, 7, 31) }),
  Fall: (year) => ({ start_date: new Date(year, 8, 1), end_date: new Date(year, 11, 31) }),
};

const getNextSemesterAuto = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month <= 4) {
    return { semester: `Summer-${year}`, ...SEMESTER_DATES.Summer(year) };
  }
  if (month <= 8) {
    return { semester: `Fall-${year}`, ...SEMESTER_DATES.Fall(year) };
  }
  return { semester: `Spring-${year + 1}`, ...SEMESTER_DATES.Spring(year + 1) };
};

const getTargetSemester = async () => {
  const configs = await SystemConfig.find({
    config_key: { $in: ['booking_target_semester', 'booking_target_year'] },
  }).lean();

  const map = {};
  configs.forEach((c) => {
    map[c.config_key] = c.config_value;
  });

  const semName = map['booking_target_semester'];
  const year = map['booking_target_year'] ? Number(map['booking_target_year']) : null;

  if (semName && year && SEMESTER_DATES[semName]) {
    return { semester: `${semName}-${year}`, ...SEMESTER_DATES[semName](year) };
  }

  return getNextSemesterAuto();
};

// Keep sync version for backward-compat (violation.service.js has its own copy)
const getNextSemester = getNextSemesterAuto;

// ─── Student Filter Logic ─────────────────────────────────
const getStudentFilter = (student) => ({
  roomStudentType: student.student_type === 'international' ? 'international' : 'vietnamese',
  genderTypes:
    student.gender === 'male'
      ? ['male', 'mixed']
      : student.gender === 'female'
        ? ['female', 'mixed']
        : ['mixed'],
});

const findStudent = async (userId) => {
  const student = await Student.findOne({ user: userId });
  if (!student) throw new AppError('Only registered students can book rooms', 403);
  return student;
};

const DORM_BOOKING_SUSPENDED_MSG =
  'Dormitory services have been suspended for your account.';

const assertStudentMayUseBooking = (student) => {
  if (student.dorm_booking_suspended) {
    throw new AppError(DORM_BOOKING_SUSPENDED_MSG, 403);
  }
};

// ─── Generate Invoice Code ────────────────────────────────
const generateInvoiceCode = async () => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `BOOK-${dateStr}-`;

  const lastInvoice = await Invoice.findOne({
    invoice_code: { $regex: `^${prefix}` },
  }).sort({ invoice_code: -1 });

  let seq = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoice_code.split('-').pop(), 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── 0. getBookingWindowStatus ────────────────────────────
const getBookingWindowStatus = async (userId) => {
  const student = await findStudent(userId);

  if (student.dorm_booking_suspended) {
    return {
      allowed: false,
      window_type: null,
      dorm_booking_suspended: true,
    };
  }

  const configs = await SystemConfig.find({
    config_key: { $in: Object.values(BOOKING_CONFIG_KEYS) },
  }).lean();

  const map = {};
  configs.forEach((c) => {
    map[c.config_key] = c.config_value;
  });

  const now = new Date();

  // Lazy activation: upcoming contracts whose start_date has passed become active,
  // and sync the bed status from 'reserved' → 'occupied'
  const activatedContracts = await Contract.find(
    { student: student._id, status: 'upcoming', start_date: { $lte: now } },
    { bed: 1 }
  ).lean();
  if (activatedContracts.length > 0) {
    const bedIds = activatedContracts.map((c) => c.bed);
    await Promise.all([
      Contract.updateMany(
        { student: student._id, status: 'upcoming', start_date: { $lte: now } },
        { $set: { status: 'active' } }
      ),
      Bed.updateMany(
        { _id: { $in: bedIds }, status: 'reserved' },
        { $set: { status: 'occupied' } }
      ),
    ]);
  }

  // Student has an active/upcoming contract -> hold-bed category
  const activeContract = await Contract.findOne({
    student: student._id,
    status: { $in: ['active', 'extended', 'upcoming'] },
  });

  if (activeContract) {
    // 1. Hold window takes priority
    const holdAllowed = isWithinWindow(
      now,
      map[BOOKING_CONFIG_KEYS.HOLD_START],
      map[BOOKING_CONFIG_KEYS.HOLD_END]
    );
    if (holdAllowed) {
      const nextSem = await getTargetSemester();
      const bedId = activeContract.bed;
      const studentId = student._id;

      const bedTakenByBooking = await BookingRequest.findOne({
        bed: bedId,
        semester: nextSem.semester,
        status: { $in: ['awaiting_payment', 'approved'] },
        student: { $ne: studentId },
        checkout_date: null,
      }).lean();

      const bedTakenByContract = !bedTakenByBooking && await Contract.findOne({
        bed: bedId,
        status: 'upcoming',
        student: { $ne: studentId },
      }).lean();

      const bed_taken = !!(bedTakenByBooking || bedTakenByContract);
      return {
        allowed: true,
        window_type: 'hold',
        bed_id: String(bedId),
        bed_taken,
        bed_taken_reason: bed_taken
          ? 'Your bed has been booked by another student for the next semester. Please contact management.'
          : null,
      };
    }

    // 2. If hold window is closed but new booking window is open AND target semester
    //    is strictly after the student's current semester → allow new booking
    const newAllowed = isWithinWindow(
      now,
      map[BOOKING_CONFIG_KEYS.NEW_START],
      map[BOOKING_CONFIG_KEYS.NEW_END]
    );
    if (newAllowed) {
      const nextSem = await getTargetSemester();
      // Check if student has an approved hold-bed booking (persists even when window switches)
      const holdBooking = await BookingRequest.findOne({
        student: student._id,
        source: 'hold',
        status: 'approved',
        checkout_date: null,
      }).lean();
      const already_held = !!holdBooking;

      if (semesterRank(nextSem.semester) > semesterRank(activeContract.semester)) {
        return { allowed: true, window_type: 'new', already_held };
      }
      // Window is open but student already has a contract for the target semester
      return { allowed: false, window_type: null, already_booked: true, already_held };
    }

    return { allowed: false, window_type: null };
  }

  // No contract -> new-booking category
  const allowed = isWithinWindow(
    now,
    map[BOOKING_CONFIG_KEYS.NEW_START],
    map[BOOKING_CONFIG_KEYS.NEW_END]
  );
  return { allowed, window_type: allowed ? 'new' : null };
};

// ─── 1. getNextSemesterInfo ───────────────────────────────
const getNextSemesterInfo = async (userId) => {
  await findStudent(userId);
  return getTargetSemester();
};

// ─── 2. getAvailableRoomTypes ─────────────────────────────
const getAvailableRoomTypes = async (userId) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const blocks = await Block.find({ gender_type: { $in: genderTypes }, is_active: true }).select(
    '_id'
  );
  const blockIds = blocks.map((b) => b._id);

  const rooms = await Room.find({
    block: { $in: blockIds },
    student_type: roomStudentType,
    status: 'available',
    available_beds: { $gt: 0 },
  }).select('room_type available_beds price_per_semester student_type');

  const typeMap = {};
  for (const room of rooms) {
    if (!typeMap[room.room_type]) {
      typeMap[room.room_type] = {
        available_slots: 0,
        price_per_semester: room.price_per_semester,
        student_type: room.student_type,
      };
    }
    typeMap[room.room_type].available_slots += room.available_beds;
  }

  return Object.entries(typeMap).map(([room_type, info]) => ({
    room_type,
    available_slots: info.available_slots,
    price_per_semester: info.price_per_semester,
    student_type: info.student_type,
  }));
};

// ─── 3. getDormsForBooking ────────────────────────────────
const getDormsForBooking = async (userId, roomType) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const blocks = await Block.find({ gender_type: { $in: genderTypes }, is_active: true })
    .select('_id dorm')
    .populate('dorm', 'dorm_name dorm_code is_active');

  const activeBlocks = blocks.filter((b) => b.dorm && b.dorm.is_active);
  const blockIds = activeBlocks.map((b) => b._id);

  const rooms = await Room.find({
    block: { $in: blockIds },
    student_type: roomStudentType,
    room_type: roomType,
    status: 'available',
    available_beds: { $gt: 0 },
  }).select('block available_beds');

  // Map room.block → dorm
  const blockToDorm = {};
  for (const b of activeBlocks) {
    blockToDorm[b._id.toString()] = b.dorm;
  }

  const dormMap = {};
  for (const room of rooms) {
    const dorm = blockToDorm[room.block.toString()];
    if (!dorm) continue;
    const dormId = dorm._id.toString();
    if (!dormMap[dormId]) {
      dormMap[dormId] = {
        dorm_id: dormId,
        dorm_name: dorm.dorm_name,
        dorm_code: dorm.dorm_code,
        available_slots: 0,
      };
    }
    dormMap[dormId].available_slots += room.available_beds;
  }

  return Object.values(dormMap);
};

// ─── 4. getFloorsForBooking ───────────────────────────────
const getFloorsForBooking = async (userId, dormId, roomType) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const blocks = await Block.find({
    dorm: dormId,
    gender_type: { $in: genderTypes },
    is_active: true,
  }).select('_id');
  const blockIds = blocks.map((b) => b._id);

  const rooms = await Room.find({
    block: { $in: blockIds },
    student_type: roomStudentType,
    room_type: roomType,
    status: { $in: ['available', 'full'] },
  }).select('floor available_beds total_beds status');

  const floorMap = {};
  for (const room of rooms) {
    if (!floorMap[room.floor]) floorMap[room.floor] = 0;
    floorMap[room.floor] += room.status === 'full' ? room.total_beds : room.available_beds;
  }

  return Object.entries(floorMap)
    .map(([floor, available_slots]) => ({ floor: Number(floor), available_slots }))
    .sort((a, b) => a.floor - b.floor);
};

// ─── 5. getBlocksForBooking ──────────────────────────────
const getBlocksForBooking = async (userId, dormId, floor, roomType) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const blocks = await Block.find({
    dorm: dormId,
    floor: Number(floor),
    gender_type: { $in: genderTypes },
    is_active: true,
  }).select('_id block_name block_code');

  const blockIds = blocks.map((b) => b._id);

  const rooms = await Room.find({
    block: { $in: blockIds },
    student_type: roomStudentType,
    room_type: roomType,
    status: { $in: ['available', 'full'] },
  }).select('block available_beds total_beds status');

  const blockMap = {};
  for (const b of blocks) {
    blockMap[b._id.toString()] = {
      block_id: b._id.toString(),
      block_name: b.block_name,
      block_code: b.block_code,
      available_slots: 0,
    };
  }
  for (const room of rooms) {
    const bid = room.block.toString();
    if (blockMap[bid])
      blockMap[bid].available_slots += room.status === 'full' ? room.total_beds : room.available_beds;
  }

  return Object.values(blockMap).filter((b) => b.available_slots > 0);
};

// ─── 6. getRoomsForBooking ────────────────────────────────
const getRoomsForBooking = async (userId, blockId, roomType) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const block = await Block.findById(blockId).populate('dorm', 'dorm_name dorm_code');
  if (!block) throw new AppError('Block not found', 404);
  if (!genderTypes.includes(block.gender_type)) {
    throw new AppError('Block does not match your gender', 403);
  }

  const rooms = await Room.find({
    block: blockId,
    student_type: roomStudentType,
    room_type: roomType,
    status: { $in: ['available', 'full'] },
  }).lean();

  return rooms.map((r) => ({
    ...r,
    id: r._id,
    block: {
      id: block._id,
      block_name: block.block_name,
      block_code: block.block_code,
      dorm: block.dorm ? { id: block.dorm._id, dorm_name: block.dorm.dorm_name } : null,
    },
  }));
};

// ─── 7. getBedsForBooking ─────────────────────────────────
const getBedsForBooking = async (userId, roomId) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const room = await Room.findById(roomId).populate({
    path: 'block',
    select: 'gender_type',
  });
  if (!room) throw new AppError('Room not found', 404);
  if (room.student_type !== roomStudentType) {
    throw new AppError('Room does not match your student type', 403);
  }
  if (!genderTypes.includes(room.block.gender_type)) {
    throw new AppError('Room block does not match your gender', 403);
  }

  const beds = await Bed.find({ room: roomId, status: { $in: ['available', 'occupied'] } })
    .select('bed_number status')
    .sort({ bed_number: 1 })
    .lean();

  // Filter out beds already booked/contracted for next semester (available or occupied)
  const allBedIds = beds.map((b) => b._id);
  let takenBedIdSet = new Set();
  if (allBedIds.length > 0) {
    const nextSem = await getTargetSemester();
    const [takenByBooking, takenByContract, checkedOutBookings] = await Promise.all([
      BookingRequest.find({
        bed: { $in: allBedIds },
        semester: nextSem.semester,
        status: { $in: ['awaiting_payment', 'approved'] },
        checkout_date: null,
      })
        .select('bed')
        .lean(),
      Contract.find({
        bed: { $in: allBedIds },
        semester: nextSem.semester,
        status: 'upcoming',
      })
        .select('bed')
        .lean(),
      BookingRequest.find({
        student: student._id,
        semester: nextSem.semester,
        status: 'approved',
        checkout_date: { $ne: null },
        $or: [{ bed: { $in: allBedIds } }, { bed_transfer: { $in: allBedIds } }],
      })
        .select('bed bed_transfer')
        .lean(),
    ]);
    for (const r of [...takenByBooking, ...takenByContract]) {
      takenBedIdSet.add(String(r.bed));
    }
    for (const booking of checkedOutBookings) {
      const checkedOutBedId = booking.bed_transfer || booking.bed;
      if (checkedOutBedId) takenBedIdSet.add(String(checkedOutBedId));
    }
  }

  return beds
    .filter((b) => !takenBedIdSet.has(String(b._id)))
    .map((b) => ({ id: b._id, bed_number: b.bed_number, status: b.status }));
};

// ─── Soft lock ─────────────────────────────────────────────

const softLockBed = async (userId, bedId, io) => {
  const bed = await Bed.findById(bedId).select('status').lean();
  if (!bed) throw new AppError('Bed not found', 404);
  if (!['available', 'occupied'].includes(bed.status))
    throw new AppError('Bed is not available for booking', 409);
  if (bedSoftLock.isLockedByOther(bedId, userId)) {
    throw new AppError('Bed is currently being selected by another student', 409);
  }
  bedSoftLock.lockBed(bedId, userId, io);
  return { bedId: String(bedId), locked_until: new Date(Date.now() + 5 * 60 * 1000) };
};

const softUnlockBed = (userId, bedId, io) => {
  bedSoftLock.unlockBed(bedId, io);
};

const getSoftLockedBeds = () => ({ locked_bed_ids: bedSoftLock.getAllLockedBedIds() });

const hasCheckedOutFromBedInSemester = async (studentId, semester, bedId) => {
  const checkedOutBooking = await BookingRequest.findOne({
    student: studentId,
    semester,
    status: 'approved',
    checkout_date: { $ne: null },
    $or: [{ bed: bedId }, { bed_transfer: bedId }],
  })
    .select('_id')
    .lean();

  return !!checkedOutBooking;
};

// ─── 8. submitBooking ─────────────────────────────────────
const submitBooking = async (userId, { bed_id, note }, io = null) => {
  const student = await findStudent(userId);
  assertStudentMayUseBooking(student);

  // Enforce booking window
  const windowStatus = await getBookingWindowStatus(userId);
  if (!windowStatus.allowed) {
    throw new AppError('Dormitory booking is not currently open', 403);
  }
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const bed = await Bed.findById(bed_id);
  if (!bed) throw new AppError('Bed not found', 404);
  if (!['available', 'occupied'].includes(bed.status))
    throw new AppError('Bed is no longer available for booking', 409);

  const room = await Room.findById(bed.room).populate({
    path: 'block',
    select: 'gender_type block_name block_code dorm',
    populate: { path: 'dorm', select: 'dorm_name dorm_code' },
  });
  if (!room) throw new AppError('Room not found', 404);
  if (room.student_type !== roomStudentType) {
    throw new AppError('Room does not match your student type', 403);
  }
  if (!genderTypes.includes(room.block.gender_type)) {
    throw new AppError('Room block does not match your gender', 403);
  }

  const nextSem = await getTargetSemester();

  // If student has an active contract, target semester must be strictly after current semester
  const activeContract = await Contract.findOne({ student: student._id, status: 'active' });
  if (activeContract && semesterRank(nextSem.semester) <= semesterRank(activeContract.semester)) {
    const problem = semesterRank(nextSem.semester) === semesterRank(activeContract.semester)
      ? 'same as' : 'earlier than';
    throw new AppError(
      `Cannot book: the configured target semester (${nextSem.semester}) is ${problem} your current semester (${activeContract.semester}). Please contact the manager — there is a configuration error.`,
      400
    );
  }

  // Check for existing active booking (exclude checked-out bookings)
  const existingBooking = await BookingRequest.findOne({
    student: student._id,
    semester: nextSem.semester,
    status: { $in: ['awaiting_payment', 'approved'] },
    checkout_date: null,
  });
  if (existingBooking) {
    throw new AppError('You already have an active booking for this semester', 409);
  }

  if (await hasCheckedOutFromBedInSemester(student._id, nextSem.semester, bed._id)) {
    throw new AppError(
      'You cannot book this bed again in the same semester after checking out from it',
      409
    );
  }

  // Check if this specific bed is already booked/contracted for next semester
  const bedAlreadyBooked = await BookingRequest.findOne({
    bed: bed._id,
    semester: nextSem.semester,
    status: { $in: ['awaiting_payment', 'approved'] },
    checkout_date: null,
  }).lean();
  if (bedAlreadyBooked) {
    throw new AppError('This bed has already been booked for next semester', 409);
  }
  const bedAlreadyContracted = await Contract.findOne({
    bed: bed._id,
    semester: nextSem.semester,
    status: 'upcoming',
  }).lean();
  if (bedAlreadyContracted) {
    throw new AppError('This bed already has a contract for next semester', 409);
  }

  // Release soft lock silently (no bed_soft_unlocked event) then notify UIs to hide this bed.
  // Emitting bed_soft_unlocked here would cause a brief flicker on the occupant's hold-bed button.
  // bed_reserved is sufficient to remove the bed from all clients.
  bedSoftLock.releaseLockSilent(String(bed._id));
  if (io) io.emit('bed_reserved', { bedId: String(bed._id) });

  // If booking an occupied bed, notify the current occupant that their bed has been taken —
  // their Hold Bed button should update to "Cannot Hold Bed".
  if (io && bed.status === 'occupied') {
    const occupantContract = await Contract.findOne({
      bed: bed._id,
      status: { $in: ['active', 'extended'] },
    })
      .select('student')
      .lean();
    if (occupantContract) {
      const occupantStudent = await Student.findById(occupantContract.student)
        .select('user')
        .lean();
      if (occupantStudent?.user) {
        io.to(`user_${occupantStudent.user}`).emit('booking_window_status_changed');
      }
    }
  }

  // Generate invoice
  const invoice_code = await generateInvoiceCode();
  const invoice = await Invoice.create({
    invoice_code,
    student: student._id,
    room: room._id,
    invoice_month: nextSem.semester,
    room_fee: room.price_per_semester,
    electricity_fee: 0,
    water_fee: 0,
    service_fee: 0,
    total_amount: room.price_per_semester,
    payment_status: 'unpaid',
    due_date: nextSem.start_date,
  });

  // Create booking with 10-minute hold
  const expires_at = new Date(Date.now() + 10 * 60 * 1000);
  const booking = await BookingRequest.create({
    student: student._id,
    room: room._id,
    bed: bed._id,
    invoice: invoice._id,
    note: note || null,
    semester: nextSem.semester,
    start_date: nextSem.start_date,
    end_date: nextSem.end_date,
    expires_at,
    status: 'awaiting_payment',
  });

  const populatedBooking = await BookingRequest.findById(booking._id)
    .populate({
      path: 'room',
      select:
        'room_number room_type floor total_beds available_beds price_per_semester student_type',
      populate: {
        path: 'block',
        select: 'block_name block_code gender_type',
        populate: { path: 'dorm', select: 'dorm_name dorm_code' },
      },
    })
    .populate('bed', 'bed_number');

  // PayOS link is created separately via POST /bookings/:id/payos-link
  // to avoid duplicate orderCode issues on retry.
  return { booking: populatedBooking, invoice, payos: null, payment: null };
};

// ─── 9a. createPayosLinkForBooking ───────────────────────
const createPayosLinkForBooking = async (bookingId, userId) => {
  const student = await findStudent(userId);

  const booking = await BookingRequest.findById(bookingId).populate('invoice');
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.student.toString() !== student._id.toString()) {
    throw new AppError('Forbidden', 403);
  }
  if (booking.status !== 'awaiting_payment') {
    throw new AppError('Booking is not awaiting payment', 400);
  }
  if (new Date() > booking.expires_at) {
    throw new AppError('Booking has expired. Please book again.', 410);
  }

  const invoice = booking.invoice;
  if (!invoice) throw new AppError('Invoice not found', 404);

  // Return existing link if already created
  const existingPayment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
    payos_checkout_url: { $ne: null },
  }).lean();
  if (existingPayment?.payos_checkout_url) {
    return {
      orderCode: existingPayment.payos_order_code,
      paymentLinkId: existingPayment.payos_payment_link_id,
      checkoutUrl: existingPayment.payos_checkout_url,
      qrCode: existingPayment.payos_qr_code,
    };
  }

  const returnUrl = process.env.PAYOS_RETURN_URL;
  const cancelUrl = process.env.PAYOS_CANCEL_URL;
  if (!returnUrl || !cancelUrl) throw new AppError('Payment gateway not configured', 503);

  // Use Date.now() as orderCode — same pattern as keepBed — to avoid
  // PayOS "already exists" (code 231) when a previous attempt left a stale link.
  const orderCode = Number(Date.now());
  const buyer = await User.findById(student.user).select('email full_name').lean();

  try {
    const paymentLink = await createPayosPaymentLink({
      orderCode,
      amount: invoice.total_amount,
      description: invoice.invoice_code,
      returnUrl,
      cancelUrl,
      buyerEmail: buyer?.email,
      buyerName: buyer?.full_name || student.full_name,
      items: [
        { name: `Dorm booking ${invoice.invoice_code}`, quantity: 1, price: invoice.total_amount },
      ],
    });

    const payosPaymentLinkId = paymentLink?.paymentLinkId || paymentLink?.id || null;
    const payosCheckoutUrl = paymentLink?.checkoutUrl || paymentLink?.checkout_url || null;
    const payosQrCode = paymentLink?.qrCode || paymentLink?.qr_code || null;

    await Payment.findOneAndUpdate(
      { invoice: invoice._id, payment_method: 'payos' },
      {
        $set: {
          transaction_code: `PAYOS-${orderCode}`,
          payos_order_code: orderCode,
          payos_payment_link_id: payosPaymentLinkId,
          payos_checkout_url: payosCheckoutUrl,
          payos_qr_code: payosQrCode,
          payment_status: 'pending',
          transaction_details: paymentLink || null,
        },
        $setOnInsert: { student: student._id, amount: invoice.total_amount, payment_method: 'payos' },
      },
      { upsert: true, new: true }
    );

    return { orderCode, paymentLinkId: payosPaymentLinkId, checkoutUrl: payosCheckoutUrl, qrCode: payosQrCode };
  } catch (err) {
    await cancelPayosPaymentLink(orderCode, 'createPayosLink failed - cleanup').catch(() => {});
    throw new AppError(err?.message || 'Failed to create payment link', 500);
  }
};

// ─── 9. checkPaymentStatus ────────────────────────────────
const checkPaymentStatus = async (bookingId, userId, io) => {
  const student = await findStudent(userId);

  const booking = await BookingRequest.findById(bookingId);
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.student.toString() !== student._id.toString()) {
    throw new AppError('Forbidden', 403);
  }

  // Already approved
  if (booking.status === 'approved') {
    const populatedBooking = await populateBookingForStudent(bookingId);
    return { booking: populatedBooking, status: 'approved', paid: true };
  }

  if (booking.status !== 'awaiting_payment') {
    throw new AppError('Booking is not awaiting payment', 400);
  }

  // Check expiration
  if (new Date() > booking.expires_at) {
    // Best-effort: cancel PayOS payment link if exists
    const pay = await Payment.findOne({
      invoice: booking.invoice,
      payment_method: 'payos',
      payment_status: 'pending',
    }).lean();
    if (pay?.payos_order_code) {
      await cancelPayosPaymentLink(pay.payos_order_code, 'Booking expired (10-minute hold)');
      await Payment.updateOne({ _id: pay._id }, { $set: { payment_status: 'expired' } });
    }

    // Rollback bed only if already 'reserved' (payment was confirmed before expiry).
    // If still 'available' (awaiting_payment, not yet reserved) or 'occupied' (hold-bed),
    // no status change or available_beds adjustment is needed.
    const currentBedOnExpiry = await Bed.findById(booking.bed).select('status').lean();
    if (currentBedOnExpiry?.status === 'reserved') {
      await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
      await Room.findByIdAndUpdate(booking.room, {
        $inc: { available_beds: 1 },
        $set: { status: 'available' },
      });
    }
    await InvoiceLineItem.deleteMany({ invoice: booking.invoice });
    await Invoice.deleteOne({ _id: booking.invoice });
    booking.status = 'expired';
    await booking.save();
    throw new AppError('Booking expired. Bed has been released. Please book again.', 410);
  }

  const invoice = await Invoice.findById(booking.invoice);
  if (!invoice) throw new AppError('Invoice not found', 404);

  const payment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
  });

  if (!payment?.payos_order_code) {
    const populatedBooking = await populateBookingForStudent(bookingId);
    return {
      status: 'pending',
      paid: false,
      message: 'Payment not completed',
      booking: populatedBooking,
      invoice,
    };
  }

  // Ask PayOS for real status
  const payosInfo = await getPayosPaymentInfo(payment.payos_order_code);

  // Handle PayOS cancellation (user cancelled on PayOS page)
  const payosStatus = String(payosInfo?.status || payosInfo?.data?.status || '').toLowerCase();
  if (payosStatus === 'cancelled' || payosStatus === 'canceled') {
    try {
      await cancelBooking(bookingId, userId, io);
    } catch {
      /* idempotent – already cancelled */
    }
    return { status: 'cancelled', paid: false, message: 'Booking was cancelled.' };
  }

  if (!isPayosPaid(payosInfo)) {
    const populatedBooking = await populateBookingForStudent(bookingId);
    return {
      status: 'pending',
      paid: false,
      message: 'Payment not completed',
      booking: populatedBooking,
      invoice,
      payos: {
        orderCode: payment.payos_order_code,
        checkoutUrl: payment.payos_checkout_url,
        qrCode: payment.payos_qr_code,
      },
    };
  }

  // Paid → finalize booking
  const bed = await Bed.findById(booking.bed);
  const room = await Room.findById(booking.room);
  if (!bed || !room) throw new AppError('Room/Bed not found', 404);

  // Update payment
  payment.payment_status = 'completed';
  payment.paid_at = new Date();
  payment.transaction_details = payosInfo;
  await payment.save();

  // Update invoice
  invoice.payment_status = 'paid';
  invoice.paid_at = new Date();
  await invoice.save();

  // Update bed status on payment:
  // - 'available' bed (new booking, paid now): set to 'reserved' (future) or 'occupied' (current semester)
  //   and decrement room.available_beds
  // - 'reserved' bed (already reserved before this path): same transition
  // - 'occupied' bed (hold bed or new booking of occupied bed): no change
  if (bed.status === 'available') {
    bed.status = booking.start_date <= new Date() ? 'occupied' : 'reserved';
    await bed.save();
    room.available_beds = Math.max(0, room.available_beds - 1);
    if (room.available_beds <= 0) room.status = 'full';
    await room.save();
  } else if (bed.status === 'reserved') {
    if (booking.start_date <= new Date()) {
      bed.status = 'occupied';
      await bed.save();
    }
    // future semester: stays 'reserved' until semester starts
  }
  // 'occupied' bed: student still living there, no change needed

  // Clear any lingering soft lock so its auto-expire timer doesn't fire bed_soft_unlocked
  // after payment, which would incorrectly restore the bed on other students' booking UIs.
  bedSoftLock.releaseLockSilent(String(bed._id));

  // Create contract if not exists
  // Hold-bed bookings have a future start_date → create as 'upcoming' to avoid
  // having two 'active' contracts simultaneously (current + future semester).
  const contractStatus = booking.start_date > new Date() ? 'upcoming' : 'active';

  let contract = await Contract.findOne({
    student: student._id,
    semester: booking.semester,
    status: { $in: ['active', 'upcoming'] },
  });
  if (!contract) {
    contract = await Contract.create({
      student: student._id,
      room: booking.room,
      bed: booking.bed,
      semester: booking.semester,
      start_date: booking.start_date,
      end_date: booking.end_date,
      room_price: room.price_per_semester,
      status: contractStatus,
    });
  }

  // Update booking
  booking.status = 'approved';
  await booking.save();

  // Real-time: push to student's personal socket room
  if (io && student?.user) {
    io.to(`user_${student.user}`).emit('booking_approved', {
      bookingId: booking._id.toString(),
    });
  }

  // Notify student + email
  const user = await User.findById(student.user).lean();
  if (user) {
    await Notification.create({
      user: user._id,
      title: 'Payment Successful',
      message: `Your payment for ${invoice.invoice_code} is successful. Booking is approved.`,
      notification_type: 'success',
      category: 'payment',
      related_id: booking._id.toString(),
    });

    // Email is best-effort
    try {
      await sendPaymentSuccessEmail({
        to: user.email,
        studentName: student.full_name,
        invoiceCode: invoice.invoice_code,
        amountVnd: invoice.total_amount,
      });
    } catch (e) {
      console.error('[Email] sendPaymentSuccessEmail failed:', e.message);
    }
  }

  const populatedBooking = await populateBookingForStudent(bookingId);
  return { status: 'paid', paid: true, booking: populatedBooking, invoice, payment, contract };
};

// ─── 10. getMyBookings ────────────────────────────────────
const getMyBookings = async (userId, query = {}) => {
  const student = await findStudent(userId);
  const { page = 1, limit = 10 } = query;

  const [items, total] = await Promise.all([
    BookingRequest.find({ student: student._id })
      .populate({
        path: 'room',
        select: 'room_number room_type floor total_beds available_beds price_per_semester',
        populate: {
          path: 'block',
          select: 'block_name block_code',
          populate: { path: 'dorm', select: 'dorm_name dorm_code' },
        },
      })
      .populate('bed', 'bed_number')
      .populate({
        path: 'bed_transfer',
        select: 'bed_number room',
        populate: {
          path: 'room',
          select: 'room_number block',
          populate: {
            path: 'block',
            select: 'block_name block_code',
            populate: { path: 'dorm', select: 'dorm_name dorm_code' },
          },
        },
      })
      .populate('invoice', 'invoice_code total_amount payment_status due_date')
      .sort({ requested_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    BookingRequest.countDocuments({ student: student._id }),
  ]);

  // Attach PayOS payment info (for resume payment in Payment page / My Requests)
  const invoiceIds = items.map((i) => i.invoice && (i.invoice._id || i.invoice.id)).filter(Boolean);

  const payments = invoiceIds.length
    ? await Payment.find({
        invoice: { $in: invoiceIds },
        payment_method: 'payos',
      })
        .select(
          'invoice payos_order_code payos_payment_link_id payos_checkout_url payos_qr_code payment_status'
        )
        .lean()
    : [];

  const payByInvoice = new Map(
    payments.map((p) => [
      p.invoice.toString(),
      {
        orderCode: p.payos_order_code,
        paymentLinkId: p.payos_payment_link_id,
        checkoutUrl: p.payos_checkout_url,
        qrCode: p.payos_qr_code,
        status: p.payment_status,
      },
    ])
  );

  return {
    items: items.map((i) => {
      const invId = i.invoice && (i.invoice._id || i.invoice.id);
      return {
        ...i,
        id: i._id,
        payos: invId ? payByInvoice.get(invId.toString()) || null : null,
      };
    }),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Handle PayOS webhook (verified in controller).
 * We keep it idempotent: if already completed/expired/cancelled, do nothing.
 */
const handlePayosWebhook = async (webhookData, io) => {
  const raw = webhookData?.data ?? webhookData ?? {};
  const orderCode = raw.orderCode ?? raw.order_code ?? webhookData?.orderCode;
  const status = String(
    raw.status ?? raw.paymentStatus ?? raw.payment_status ?? webhookData?.status ?? ''
  ).toLowerCase();

  if (!orderCode) return { ok: true, ignored: true, reason: 'missing orderCode' };

  const payment = await Payment.findOne({ payos_order_code: Number(orderCode) });
  if (!payment) return { ok: true, ignored: true, reason: 'payment not found' };

  if (payment.payment_status === 'completed') {
    return { ok: true, ignored: true, reason: 'already completed' };
  }

  const payClosed = ['cancelled', 'expired'].includes(payment.payment_status);
  const cancelLike =
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'cancel' ||
    status === 'void' ||
    status === 'voided';

  const booking = await BookingRequest.findOne({ invoice: payment.invoice });
  const student = await Student.findById(payment.student).lean();
  if (!student) return { ok: true, ignored: true, reason: 'student not found' };

  // Payment already marked closed in DB: repair bed-transfer row if it still awaited supplement pay
  if (payClosed && !booking) {
    try {
      const RTS = require('./roomTransfer.service');
      const repaired = await RTS.cancelBedUpgradeFromPayosWebhook(payment, io);
      if (repaired) return { ok: true, handled: true, status: 'cancelled_repair' };
    } catch (err) {
      console.error('[PayOS Webhook] bed upgrade repair failed:', err?.message || err);
    }
  }

  if (payClosed) {
    return { ok: true, ignored: true, reason: 'already closed' };
  }

  if (booking) {
    if (status === 'paid' || status === 'success' || status === 'completed') {
      // Re-use checkPaymentStatus() which finalizes booking + sends email.
      return checkPaymentStatus(booking._id.toString(), student.user.toString(), io);
    }

    if (cancelLike) {
      try {
        await cancelBooking(booking._id.toString(), student.user.toString(), io);
      } catch (err) {
        console.error('[PayOS Webhook] cancelBooking failed:', err?.message || err);
      }
      return { ok: true, handled: true, status: 'cancelled' };
    }

    return { ok: true, ignored: true, status };
  }

  // Bed-upgrade supplement (invoice has no booking row)
  if (cancelLike) {
    try {
      const RTS = require('./roomTransfer.service');
      const handled = await RTS.cancelBedUpgradeFromPayosWebhook(payment, io);
      if (handled) return { ok: true, handled: true, status: 'cancelled' };
    } catch (err) {
      console.error('[PayOS Webhook] bed upgrade cancel failed:', err?.message || err);
    }
  }

  return { ok: true, ignored: true, reason: 'booking not found' };
};

// ─── 11. cancelBooking ────────────────────────────────────
const cancelBooking = async (bookingId, userId, io) => {
  const student = await findStudent(userId);

  const booking = await BookingRequest.findById(bookingId);
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.student.toString() !== student._id.toString()) {
    throw new AppError('Forbidden', 403);
  }
  if (booking.status !== 'awaiting_payment') {
    throw new AppError('Can only cancel unpaid bookings', 400);
  }

  // Best-effort: cancel PayOS payment link if exists
  const payment = await Payment.findOne({
    invoice: booking.invoice,
    payment_method: 'payos',
    payment_status: 'pending',
  }).lean();
  if (payment?.payos_order_code) {
    await cancelPayosPaymentLink(payment.payos_order_code, 'User cancelled booking');
    await Payment.deleteOne({ _id: payment._id });
  }

  // Rollback bed only if it was already set to 'reserved' (payment confirmed then cancelled is
  // not possible here, but guard anyway). If bed is still 'available' (awaiting_payment, not yet
  // reserved) or 'occupied' (hold-bed), no status change or available_beds adjustment is needed.
  const currentBed = await Bed.findById(booking.bed).select('status').lean();
  if (currentBed?.status === 'reserved') {
    await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
    await Room.findByIdAndUpdate(booking.room, {
      $inc: { available_beds: 1 },
      $set: { status: 'available' },
    });
  }
  // Delete invoice + booking (no need to persist cancelled state)
  await InvoiceLineItem.deleteMany({ invoice: booking.invoice });
  await Invoice.deleteOne({ _id: booking.invoice });
  await booking.deleteOne();

  // Real-time: push to student's personal socket room
  if (io && student?.user) {
    io.to(`user_${student.user}`).emit('booking_cancelled', {
      bookingId: booking._id.toString(),
    });
  }

  // Clear any lingering soft lock so the bed is truly selectable again.
  // Without this, Student B sees the bed (from the event) but can't select it
  // (isLockedByOther returns true) and reload hides the bed (API filters locked beds).
  bedSoftLock.releaseLockSilent(String(booking.bed));
  if (io) io.emit('bed_soft_unlocked', { bedId: String(booking.bed) });

  // If the cancelled booking was for an occupied bed (hold-bed scenario),
  // notify the current occupant that their bed is free to hold again.
  if (io && currentBed?.status === 'occupied') {
    const occupantContract = await Contract.findOne({
      bed: booking.bed,
      status: { $in: ['active', 'extended'] },
    })
      .select('student')
      .lean();
    if (occupantContract) {
      const occupantStudent = await Student.findById(occupantContract.student)
        .select('user')
        .lean();
      if (occupantStudent?.user) {
        io.to(`user_${occupantStudent.user}`).emit('booking_window_status_changed');
      }
    }
  }

  return booking;
};

// ─── 12. keepBed ──────────────────────────────────────────
const keepBed = async (userId, io = null) => {
  const student = await findStudent(userId);
  assertStudentMayUseBooking(student);

  // Must be in hold window
  const windowStatus = await getBookingWindowStatus(userId);
  if (!windowStatus.allowed || windowStatus.window_type !== 'hold') {
    throw new AppError('Bed hold period is not currently active', 403);
  }
  const nextSem = await getTargetSemester();

  // Check no existing active (non-checked-out) booking for next semester
  const existingBooking = await BookingRequest.findOne({
    student: student._id,
    semester: nextSem.semester,
    status: { $in: ['awaiting_payment', 'approved'] },
    checkout_date: null,
  });
  if (existingBooking) {
    throw new AppError('You already have an active booking for the next semester', 409);
  }

  // Find active contract
  const contract = await Contract.findOne({ student: student._id, status: { $in: ['active', 'extended'] } })
    .populate({
      path: 'room',
      populate: { path: 'block', populate: { path: 'dorm', select: 'dorm_name dorm_code' } },
    })
    .populate('bed', 'bed_number');
  if (!contract) throw new AppError('No active contract found', 404);

  // Validate target semester is strictly after the student's current semester
  const currentRank = semesterRank(contract.semester);
  const targetRank = semesterRank(nextSem.semester);
  if (targetRank <= currentRank) {
    const problem = targetRank === currentRank ? 'same as' : 'earlier than';
    throw new AppError(
      `Cannot keep bed: the configured target semester (${nextSem.semester}) is ${problem} your current semester (${contract.semester}). Please contact the manager — there is a configuration error.`,
      400
    );
  }

  const room = contract.room;
  const bed = contract.bed;

  // Check if another student has already booked this bed for next semester
  const bedTakenByBooking = await BookingRequest.findOne({
    bed: bed._id,
    semester: nextSem.semester,
    status: { $in: ['awaiting_payment', 'approved'] },
    student: { $ne: student._id },
    checkout_date: null,
  }).lean();
  if (bedTakenByBooking) {
    throw new AppError(
      'Your current bed has already been booked by another student for the next semester. Please contact management.',
      409
    );
  }

  const bedTakenByContract = await Contract.findOne({
    bed: bed._id,
    status: 'upcoming',
    student: { $ne: student._id },
  }).lean();
  if (bedTakenByContract) {
    throw new AppError(
      'Your current bed has already been assigned to another student for the next semester. Please contact management.',
      409
    );
  }

  // Generate invoice
  const invoice_code = await generateInvoiceCode();
  const invoice = await Invoice.create({
    invoice_code,
    student: student._id,
    room: room._id,
    invoice_month: nextSem.semester,
    room_fee: room.price_per_semester,
    electricity_fee: 0,
    water_fee: 0,
    service_fee: 0,
    total_amount: room.price_per_semester,
    payment_status: 'unpaid',
    due_date: nextSem.start_date,
  });

  const expires_at = new Date(Date.now() + 10 * 60 * 1000);
  const booking = await BookingRequest.create({
    student: student._id,
    room: room._id,
    bed: bed._id,
    invoice: invoice._id,
    semester: nextSem.semester,
    start_date: nextSem.start_date,
    end_date: nextSem.end_date,
    expires_at,
    status: 'awaiting_payment',
    source: 'hold',
  });

  // Notify other students' booking UIs to hide this bed immediately
  if (io) io.emit('bed_reserved', { bedId: String(bed._id) });

  const populatedBooking = await BookingRequest.findById(booking._id)
    .populate({
      path: 'room',
      select:
        'room_number room_type floor total_beds available_beds price_per_semester student_type',
      populate: {
        path: 'block',
        select: 'block_name block_code gender_type',
        populate: { path: 'dorm', select: 'dorm_name dorm_code' },
      },
    })
    .populate('bed', 'bed_number');

  const returnUrl = process.env.PAYOS_RETURN_URL;
  const cancelUrl = process.env.PAYOS_CANCEL_URL;
  if (!returnUrl || !cancelUrl) {
    return { booking: populatedBooking, invoice, payos: null, payment: null };
  }

  // Use Date.now() so each keepBed attempt gets a unique orderCode —
  // avoids PayOS "already exists" (code 231) when a previous attempt left a stale link.
  const orderCode = Number(Date.now());

  try {

    const buyer = await User.findById(student.user).select('email full_name').lean();

    const paymentLink = await createPayosPaymentLink({
      orderCode,
      amount: invoice.total_amount,
      description: invoice.invoice_code,
      returnUrl,
      cancelUrl,
      buyerEmail: buyer?.email,
      buyerName: buyer?.full_name || student.full_name,
      items: [
        { name: `Keep bed ${invoice.invoice_code}`, quantity: 1, price: invoice.total_amount },
      ],
    });

    const payosPaymentLinkId = paymentLink?.paymentLinkId || paymentLink?.id || null;
    const payosCheckoutUrl = paymentLink?.checkoutUrl || paymentLink?.checkout_url || null;
    const payosQrCode = paymentLink?.qrCode || paymentLink?.qr_code || null;

    await Payment.create({
      transaction_code: `PAYOS-${orderCode}`,
      payos_order_code: orderCode,
      payos_payment_link_id: payosPaymentLinkId,
      payos_checkout_url: payosCheckoutUrl,
      payos_qr_code: payosQrCode,
      invoice: invoice._id,
      student: student._id,
      amount: invoice.total_amount,
      payment_method: 'payos',
      payment_status: 'pending',
      transaction_details: paymentLink || null,
    });

    return {
      booking: populatedBooking,
      invoice,
      payos: {
        orderCode,
        paymentLinkId: payosPaymentLinkId,
        checkoutUrl: payosCheckoutUrl,
        qrCode: payosQrCode,
      },
    };
  } catch (err) {
    // Cancel PayOS link if it was created in this attempt
    await cancelPayosPaymentLink(orderCode, 'keepBed failed - cleanup').catch(() => {});
    await InvoiceLineItem.deleteMany({ invoice: invoice._id });
    await Invoice.deleteOne({ _id: invoice._id });
    await BookingRequest.deleteOne({ _id: booking._id });
    throw new AppError(err?.message || 'Failed to create payment link', 500);
  }
};

// ─── 13. searchStudentForCheckout (manager) ───────────────
const searchStudentForCheckout = async (studentCode) => {
  if (!studentCode) throw new AppError('student_code is required', 400);

  const student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${studentCode}$`, 'i') },
  })
    .populate({ path: 'user', select: 'email full_name' })
    .lean();
  if (!student) throw new AppError('Student not found', 404);

  const contractPopulate = {
    path: 'room',
    select: 'room_number room_type floor price_per_semester',
    populate: {
      path: 'block',
      select: 'block_name block_code',
      populate: { path: 'dorm', select: 'dorm_name dorm_code' },
    },
  };

  const [contract, upcomingContract] = await Promise.all([
    Contract.findOne({ student: student._id, status: { $in: ['active', 'extended'] } })
      .populate(contractPopulate)
      .populate('bed', 'bed_number')
      .lean(),
    Contract.findOne({ student: student._id, status: 'upcoming' })
      .populate(contractPopulate)
      .populate('bed', 'bed_number')
      .lean(),
  ]);

  const formatContract = (c) =>
    c
      ? {
          id: c._id,
          semester: c.semester,
          start_date: c.start_date,
          end_date: c.end_date,
          room_price: c.room_price,
          status: c.status,
          room: c.room,
          bed: c.bed,
        }
      : null;

  return {
    student: {
      id: student._id,
      full_name: student.full_name,
      student_code: student.student_code,
      gender: student.gender,
      student_type: student.student_type,
      email: student.user?.email,
    },
    active_contract: formatContract(contract),
    upcoming_contract: formatContract(upcomingContract),
  };
};

// ─── 14. checkoutStudent (manager) ────────────────────────
const checkoutStudent = async (studentCode, managerId, settlementInput = {}) => {
  if (!studentCode) throw new AppError('student_code is required', 400);

  const student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${studentCode}$`, 'i') },
  });
  if (!student) throw new AppError('Student not found', 404);

  const contract = await Contract.findOne({
    student: student._id,
    status: { $in: ['active', 'extended'] },
  });
  if (!contract) throw new AppError('No active contract found for this student', 404);

  const now = new Date();

  await Contract.findByIdAndUpdate(contract._id, {
    $set: { status: 'terminated', terminated_at: now },
  });

  // If another student has an upcoming contract for this bed, keep it 'reserved'
  const upcomingForBed = await Contract.findOne({
    bed: contract.bed,
    status: 'upcoming',
  }).lean();
  await Bed.findByIdAndUpdate(contract.bed, {
    $set: { status: upcomingForBed ? 'reserved' : 'available' },
  });

  await Room.findByIdAndUpdate(contract.room, {
    $inc: { available_beds: upcomingForBed ? 0 : 1 },
    $set: { status: 'available' },
  });

  await BookingRequest.findOneAndUpdate(
    { student: student._id, semester: contract.semester, status: 'approved', checkout_date: null },
    { $set: { checkout_date: now } },
    { sort: { requested_at: -1 } }
  );

  let ewSettlement = null;
  if (
    settlementInput.electric_meter_right !== undefined ||
    settlementInput.water_meter_right !== undefined
  ) {
    const roomDoc = await Room.findById(contract.room).select('block').lean();
    ewSettlement = await createCheckoutSettlement({
      studentId: student._id.toString(),
      blockId: roomDoc?.block?.toString(),
      snapshotDate: now,
      electric_meter_right: settlementInput.electric_meter_right,
      water_meter_right: settlementInput.water_meter_right,
      term: settlementInput.term,
    });
  }

  const user = await User.findById(student.user).select('_id').lean();
  if (user) {
    const formattedDate = now.toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    await Notification.create({
      user: user._id,
      title: 'Checkout Successful',
      message: `You have been checked out by management on ${formattedDate}. You may now book a new room. If you think this is a mistake, please contact the dormitory management office.`,
      notification_type: 'info',
      category: 'general',
    });
  }

  return {
    message: 'Checkout successful',
    student_code: student.student_code,
    full_name: student.full_name,
    checkout_date: now,
    ew_settlement: ewSettlement,
  };
};

// ─── 15. listCfdAtRiskStudents (manager) ──────────────────
const listCfdAtRiskStudents = async () => {
  const students = await Student.find({ behavioral_score: { $lte: 0 } })
    .select('full_name student_code behavioral_score dorm_booking_suspended user')
    .populate({ path: 'user', select: 'email' })
    .sort({ behavioral_score: 1, student_code: 1 })
    .lean();

  const ids = students.map((s) => s._id);
  const contractMap = {};
  if (ids.length) {
    const contracts = await Contract.find({
      student: { $in: ids },
      status: { $in: ['active', 'extended'] },
    })
      .populate({
        path: 'room',
        select: 'room_number room_type floor',
        populate: {
          path: 'block',
          select: 'block_name block_code',
          populate: { path: 'dorm', select: 'dorm_name dorm_code' },
        },
      })
      .populate('bed', 'bed_number')
      .lean();
    contracts.forEach((c) => {
      contractMap[c.student.toString()] = c;
    });
  }

  return students.map((s) => {
    const c = contractMap[s._id.toString()];
    return {
      id: s._id,
      full_name: s.full_name,
      student_code: s.student_code,
      behavioral_score: s.behavioral_score,
      dorm_booking_suspended: !!s.dorm_booking_suspended,
      email: s.user?.email,
      active_contract: c
        ? {
            id: c._id,
            semester: c.semester,
            room: c.room,
            bed: c.bed,
          }
        : null,
    };
  });
};

// ─── 16. cfdDormExpelStudent (manager) ────────────────────
const cfdDormExpelStudent = async (studentCode, managerUserId, io) => {
  throw new AppError(
    'Manual CFD ban is disabled. The system now automatically suspends students when their CFD score reaches 0.',
    400
  );
};

// ─── 15. getRoommates (student) ───────────────────────────
const getRoommates = async (userId, bookingId) => {
  const student = await findStudent(userId);

  const booking = await BookingRequest.findById(bookingId).lean();
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.student.toString() !== student._id.toString()) {
    throw new AppError('Forbidden', 403);
  }

  const now = new Date();
  const isActiveBooking =
    !booking.checkout_date && booking.status === 'approved' && (!booking.end_date || new Date(booking.end_date) > now);

  let roommates = [];

  // For current stay, read from active contracts so roommates follow bed-transfer changes.
  if (isActiveBooking) {
    const myActiveContract = await Contract.findOne({
      student: student._id,
      status: { $in: ['active', 'extended'] },
    }).lean();

    if (myActiveContract?.room) {
      roommates = await Contract.find({
        room: myActiveContract.room,
        status: { $in: ['active', 'extended'] },
      })
        .populate('student', 'student_code full_name phone')
        .populate('bed', 'bed_number')
        .lean();
    }
  }

  // Fallback to booking snapshot for historical records.
  if (!roommates.length) {
    const candidates = await BookingRequest.find({
      room: booking.room,
      semester: booking.semester,
      status: 'approved',
      checkout_date: null,
    })
      .populate('student', 'student_code full_name phone')
      .populate('bed', 'bed_number')
      .populate({ path: 'bed_transfer', select: 'bed_number room' })
      .lean();

    const roomId = booking.room.toString();
    roommates = candidates.filter((r) => {
      if (!r.bed_transfer) return true;
      return r.bed_transfer.room?.toString() === roomId;
    });
  }

  return roommates.map((r) => ({
    student_code: r.student?.student_code ?? '—',
    full_name: r.student?.full_name ?? '—',
    bed_number: (r.bed_transfer?.bed_number ?? r.bed?.bed_number) ?? '—',
    phone: r.student?.phone ?? '—',
  }));
};

// ─── 16a. sendEmailToStudent (manager) ────────────────────
const sendEmailToStudent = async (bookingId, { subject, body }) => {
  const booking = await BookingRequest.findById(bookingId)
    .populate({ path: 'student', select: 'full_name user', populate: { path: 'user', select: 'email' } })
    .lean();
  if (!booking) throw new AppError('Booking not found', 404);

  const email = booking.student?.user?.email;
  if (!email) throw new AppError('Student email not found', 404);

  const result = await sendMail({ to: email, subject, html: body.replace(/\n/g, '<br>'), text: body });
  if (result?.skipped) throw new AppError('Email service is not configured (missing SMTP settings)', 503);
  return { sent: true, to: email };
};

// ─── 16b. sendEmailToAllStudents (manager) ────────────────
const sendEmailToAllStudents = async ({ subject, body }) => {
  const students = await User.find({ role: 'student', is_active: true }).select('email').lean();
  const emails = students.map((u) => u.email).filter(Boolean);
  if (!emails.length) throw new AppError('No active student emails found', 404);

  const result = await sendMail({
    to: emails.join(','),
    subject,
    html: body.replace(/\n/g, '<br>'),
    text: body,
  });
  if (result?.skipped) throw new AppError('Email service is not configured (missing SMTP settings)', 503);
  return { sent: true, count: emails.length };
};

// ─── 16. getAllBookings (manager) ──────────────────────────
const getAllBookings = async (query = {}) => {
  const { search, status, page = 1, limit = 20 } = query;
  const normalizeVi = (s) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u0111\u0110]/g, 'd')
      .toLowerCase();

  const { semester } = query;
  const VALID_STATUSES = ['approved', 'awaiting_payment', 'cancelled', 'expired'];
  const filter = { status: VALID_STATUSES.includes(status) ? status : 'approved' };
  if (semester) filter.semester = semester;
  if (search) {
    const q = normalizeVi(search);
    const allStudents = await Student.find().select('_id full_name student_code').lean();
    const matchedIds = allStudents
      .filter((s) => normalizeVi(s.full_name).includes(q) || normalizeVi(s.student_code).includes(q))
      .map((s) => s._id);
    filter.$or = [
      { semester: { $regex: search, $options: 'i' } },
      { student: { $in: matchedIds } },
    ];
  }

  const [items, total] = await Promise.all([
    BookingRequest.find(filter)
      .populate({
        path: 'student',
        select: 'full_name student_code student_type gender phone user',
        populate: { path: 'user', select: 'email' },
      })
      .populate({
        path: 'room',
        select: 'room_number room_type floor price_per_semester student_type',
        populate: {
          path: 'block',
          select: 'block_name block_code gender_type',
          populate: { path: 'dorm', select: 'dorm_name dorm_code' },
        },
      })
      .populate('bed', 'bed_number')
      .populate({
        path: 'bed_transfer',
        select: 'bed_number room',
        populate: {
          path: 'room',
          select: 'room_number block',
          populate: {
            path: 'block',
            select: 'block_name block_code gender_type dorm',
            populate: { path: 'dorm', select: 'dorm_name dorm_code' },
          },
        },
      })
      .populate('invoice', 'invoice_code total_amount payment_status')
      .sort({ requested_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    BookingRequest.countDocuments(filter),
  ]);

  const studentIds = [...new Set(items.map((i) => String(i.student?._id || '')).filter(Boolean))];
  const activeContracts = await Contract.find({
    student: { $in: studentIds },
    status: { $in: ['active', 'extended'] },
  })
    .populate({
      path: 'room',
      select: 'room_number room_type floor price_per_semester student_type block',
      populate: {
        path: 'block',
        select: 'block_name block_code gender_type dorm',
        populate: { path: 'dorm', select: 'dorm_name dorm_code' },
      },
    })
    .populate('bed', 'bed_number')
    .sort({ updatedAt: -1 })
    .lean();

  const contractByStudent = new Map();
  activeContracts.forEach((c) => {
    const key = String(c.student);
    if (!contractByStudent.has(key)) contractByStudent.set(key, c);
  });

  const now = new Date();
  const syncedItems = items.map((i) => {
    const studentId = String(i.student?._id || '');
    const activeContract = contractByStudent.get(studentId);
    const bookingIsCurrent = !i.checkout_date && (!i.end_date || new Date(i.end_date) > now);
    const sameSemester = activeContract?.semester && i.semester
      ? String(activeContract.semester) === String(i.semester)
      : false;

    if (activeContract && bookingIsCurrent && sameSemester) {
      const baseBedId = String(i.bed?._id || i.bed || '');
      const currentBedId = String(activeContract.bed?._id || activeContract.bed || '');
      const movedInCurrentSemester = currentBedId && currentBedId !== baseBedId;
      return {
        ...i,
        room: i.room,
        // Keep original booking bed; show moved bed separately in bed_transfer.
        bed: i.bed,
        bed_transfer: i.bed_transfer || (movedInCurrentSemester ? activeContract.bed : null),
        room_transfer: (i.bed_transfer && i.bed_transfer.room) || (movedInCurrentSemester ? activeContract.room : null),
      };
    }
    return i;
  });

  return {
    items: syncedItems.map((i) => ({ ...i, id: i._id })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const processAutoCheckoutExpiredBookings = async () => {
  const now = new Date();

  // Find expired bookings to get their bed/room refs before updating
  const expiredBookings = await BookingRequest.find(
    { status: 'approved', checkout_date: null, end_date: { $lte: now } },
    { bed: 1, room: 1, student: 1, semester: 1 }
  ).lean();

  if (expiredBookings.length === 0) {
    return { matched: 0, modified: 0 };
  }

  const bedIds = expiredBookings.map((b) => b.bed).filter(Boolean);
  const studentSemesterPairs = expiredBookings.map((b) => ({
    student: b.student,
    semester: b.semester,
  }));

  // Build contract filter: match by student+semester for precision
  const contractFilter = {
    $or: studentSemesterPairs.map((p) => ({
      student: p.student,
      semester: p.semester,
      status: { $in: ['active', 'extended'] },
    })),
  };

  // For each expired bed: if it has an upcoming contract → set 'reserved', else → 'available'
  const upcomingContracts = await Contract.find(
    { bed: { $in: bedIds }, status: 'upcoming' },
    { bed: 1 }
  ).lean();
  const bedsWithUpcoming = new Set(upcomingContracts.map((c) => String(c.bed)));

  await Promise.all([
    // Mark bookings as auto-checked-out
    BookingRequest.updateMany(
      { status: 'approved', checkout_date: null, end_date: { $lte: now } },
      { $set: { checkout_date: now } }
    ),
    // Expire the corresponding contracts
    Contract.updateMany(contractFilter, { $set: { status: 'expired', terminated_at: now } }),
    // Set bed status: 'reserved' if upcoming contract exists, 'available' otherwise
    ...bedIds.map((bedId) =>
      Bed.findByIdAndUpdate(bedId, {
        $set: { status: bedsWithUpcoming.has(String(bedId)) ? 'reserved' : 'available' },
      })
    ),
    // Restore available_beds count on rooms (only for beds going to 'available')
    ...expiredBookings
      .filter((b) => b.room && !bedsWithUpcoming.has(String(b.bed)))
      .map((b) => Room.findByIdAndUpdate(b.room, { $inc: { available_beds: 1 } })),
  ]);

  return {
    matched: expiredBookings.length,
    modified: expiredBookings.length,
  };
};

module.exports = {
  getBookingWindowStatus,
  keepBed,
  getNextSemesterInfo,
  getAvailableRoomTypes,
  getDormsForBooking,
  getFloorsForBooking,
  getBlocksForBooking,
  getRoomsForBooking,
  getBedsForBooking,
  submitBooking,
  checkPaymentStatus,
  getMyBookings,
  createPayosLinkForBooking,
  cancelBooking,
  sendEmailToStudent,
  sendEmailToAllStudents,
  getAllBookings,
  searchStudentForCheckout,
  checkoutStudent,
  listCfdAtRiskStudents,
  cfdDormExpelStudent,
  handlePayosWebhook,
  getRoommates,
  processAutoCheckoutExpiredBookings,
  softLockBed,
  softUnlockBed,
  getSoftLockedBeds,
};
