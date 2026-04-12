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
const {
  createPayosPaymentLink,
  getPayosPaymentInfo,
  cancelPayosPaymentLink,
} = require('./payos.service');
const { sendPaymentSuccessEmail, sendMail } = require('./email.service');

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
  'The dormitory has suspended booking services for your account due to a prior rules violation. Please contact dormitory management if you need assistance.';

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
      return { allowed: true, window_type: 'hold' };
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
      if (semesterRank(nextSem.semester) > semesterRank(activeContract.semester)) {
        return { allowed: true, window_type: 'new' };
      }
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
    status: 'available',
    available_beds: { $gt: 0 },
  }).select('floor available_beds');

  const floorMap = {};
  for (const room of rooms) {
    if (!floorMap[room.floor]) floorMap[room.floor] = 0;
    floorMap[room.floor] += room.available_beds;
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
    status: 'available',
    available_beds: { $gt: 0 },
  }).select('block available_beds');

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
    if (blockMap[bid]) blockMap[bid].available_slots += room.available_beds;
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
    status: 'available',
    available_beds: { $gt: 0 },
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

  const beds = await Bed.find({ room: roomId, status: 'available' })
    .select('bed_number status')
    .sort({ bed_number: 1 })
    .lean();

  return beds.map((b) => ({ id: b._id, bed_number: b.bed_number, status: b.status }));
};

// ─── 8. submitBooking ─────────────────────────────────────
const submitBooking = async (userId, { bed_id, note }) => {
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
  if (bed.status !== 'available') throw new AppError('Bed is no longer available', 409);

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

  // Reserve bed
  bed.status = 'reserved';
  await bed.save();

  // Sync room available_beds immediately (before payment)
  room.available_beds = Math.max(0, room.available_beds - 1);
  if (room.available_beds <= 0) room.status = 'full';
  await room.save();

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

  // Create PayOS payment link + persist Payment record (best-effort).
  // In dev or if PayOS is misconfigured, we return booking + invoice without failing the whole flow.
  try {
    const returnUrl = process.env.PAYOS_RETURN_URL;
    const cancelUrl = process.env.PAYOS_CANCEL_URL;

    // If PayOS URLs are not configured, skip online payment setup.
    if (!returnUrl || !cancelUrl) {
      return {
        booking: populatedBooking,
        invoice,
        payos: null,
        payment: null,
      };
    }

    const orderCode = invoiceCodeToOrderCode(invoice.invoice_code);
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
        {
          name: `Dorm booking ${invoice.invoice_code}`,
          quantity: 1,
          price: invoice.total_amount,
        },
      ],
    });

    const payosPaymentLinkId = paymentLink?.paymentLinkId || paymentLink?.id || null;
    const payosCheckoutUrl = paymentLink?.checkoutUrl || paymentLink?.checkout_url || null;
    const payosQrCode = paymentLink?.qrCode || paymentLink?.qr_code || null;

    const payment = await Payment.create({
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
      payment,
    };
  } catch (err) {
    // If PayOS fails (network, credentials, etc.), do not keep bed reserved forever.
    await Bed.findByIdAndUpdate(bed._id, { status: 'available' });
    await Room.findByIdAndUpdate(room._id, {
      $inc: { available_beds: 1 },
      $set: { status: 'available' },
    });
    await InvoiceLineItem.deleteMany({ invoice: invoice._id });
    await Invoice.deleteOne({ _id: invoice._id });
    await BookingRequest.deleteOne({ _id: booking._id });

    const msg = err?.message || 'Failed to create PayOS payment link';
    throw new AppError(msg, 500);
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

    // Rollback bed and restore room available_beds
    await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
    await Room.findByIdAndUpdate(booking.room, {
      $inc: { available_beds: 1 },
      $set: { status: 'available' },
    });
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

  // Update bed: 'reserved' if booking is for a future semester, 'occupied' if current
  bed.status = booking.start_date > new Date() ? 'reserved' : 'occupied';
  await bed.save();

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

  // Rollback bed and restore room available_beds
  await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
  await Room.findByIdAndUpdate(booking.room, {
    $inc: { available_beds: 1 },
    $set: { status: 'available' },
  });
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

  return booking;
};

// ─── 12. keepBed ──────────────────────────────────────────
const keepBed = async (userId) => {
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
const checkoutStudent = async (studentCode, managerId) => {
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

  await Bed.findByIdAndUpdate(contract.bed, { $set: { status: 'available' } });

  await Room.findByIdAndUpdate(contract.room, {
    $inc: { available_beds: 1 },
    $set: { status: 'available' },
  });

  await BookingRequest.findOneAndUpdate(
    { student: student._id, semester: contract.semester, status: 'approved', checkout_date: null },
    { $set: { checkout_date: now } },
    { sort: { requested_at: -1 } }
  );

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
  };
};

// ─── 15. listCfdAtRiskStudents (manager) ──────────────────
const listCfdAtRiskStudents = async () => {
  const students = await Student.find({ behavioral_score: { $lte: 2 } })
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
const cfdDormExpelStudent = async (studentCode) => {
  if (!studentCode) throw new AppError('student_code is required', 400);

  const student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${String(studentCode).trim()}$`, 'i') },
  });
  if (!student) throw new AppError('Student not found', 404);

  if (Number(student.behavioral_score) > 2) {
    throw new AppError('This action is only allowed for students with a CFD score of 2 or below.', 400);
  }

  const contract = await Contract.findOne({
    student: student._id,
    status: { $in: ['active', 'extended'] },
  });

  const now = new Date();

  if (contract) {
    await Contract.findByIdAndUpdate(contract._id, {
      $set: { status: 'terminated', terminated_at: now },
    });
    await Bed.findByIdAndUpdate(contract.bed, { $set: { status: 'available' } });
    await Room.findByIdAndUpdate(contract.room, {
      $inc: { available_beds: 1 },
      $set: { status: 'available' },
    });
    await BookingRequest.findOneAndUpdate(
      { student: student._id, semester: contract.semester, status: 'approved', checkout_date: null },
      { $set: { checkout_date: now } },
      { sort: { requested_at: -1 } }
    );
  }

  student.dorm_booking_suspended = true;
  await student.save();

  const user = await User.findById(student.user).select('_id').lean();
  if (user) {
    const message = contract
      ? 'You have been removed from your room due to a CFD score of 2 or below and a dormitory rules violation. Your bed has been released. Dormitory booking is no longer available to you. Please contact management.'
      : 'Dormitory booking has been suspended for your account due to a CFD score of 2 or below and a prior rules violation. Please contact management.';

    await Notification.create({
      user: user._id,
      title: 'Dormitory notice',
      message,
      notification_type: 'warning',
      category: 'general',
    });
  }

  return {
    message: 'Updated: booking suspended for this student; bed released if they had an active stay.',
    student_code: student.student_code,
    full_name: student.full_name,
    had_active_contract: !!contract,
    dorm_booking_suspended: true,
  };
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
    roommates = await BookingRequest.find({
      room: booking.room,
      semester: booking.semester,
      status: 'approved',
    })
      .populate('student', 'student_code full_name phone')
      .populate('bed', 'bed_number')
      .lean();
  }

  return roommates.map((r) => ({
    student_code: r.student?.student_code ?? '—',
    full_name: r.student?.full_name ?? '—',
    bed_number: r.bed?.bed_number ?? '—',
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
  const { search, page = 1, limit = 20 } = query;
  const normalizeVi = (s) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u0111\u0110]/g, 'd')
      .toLowerCase();

  const filter = { status: 'approved' };
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
        select: 'full_name student_code student_type gender user',
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

  await Promise.all([
    // Mark bookings as auto-checked-out
    BookingRequest.updateMany(
      { status: 'approved', checkout_date: null, end_date: { $lte: now } },
      { $set: { checkout_date: now } }
    ),
    // Expire the corresponding contracts
    Contract.updateMany(contractFilter, { $set: { status: 'expired', terminated_at: now } }),
    // Free the beds
    Bed.updateMany({ _id: { $in: bedIds }, status: 'occupied' }, { $set: { status: 'available' } }),
    // Restore available_beds count on rooms
    ...expiredBookings
      .filter((b) => b.room)
      .map((b) =>
        Room.findByIdAndUpdate(b.room, { $inc: { available_beds: 1 } })
      ),
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
};
