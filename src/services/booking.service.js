const {
  BookingRequest,
  Room,
  Bed,
  Block,
  Student,
  User,
  Invoice,
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

  const configs = await SystemConfig.find({
    config_key: { $in: Object.values(BOOKING_CONFIG_KEYS) },
  }).lean();

  const map = {};
  configs.forEach((c) => {
    map[c.config_key] = c.config_value;
  });

  const now = new Date();

  // Student has an active contract -> hold-bed category
  const activeContract = await Contract.findOne({
    student: student._id,
    status: 'active',
  });

  if (activeContract) {
    const allowed = isWithinWindow(
      now,
      map[BOOKING_CONFIG_KEYS.HOLD_START],
      map[BOOKING_CONFIG_KEYS.HOLD_END]
    );
    return { allowed, window_type: allowed ? 'hold' : null };
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
  // Enforce booking window
  const windowStatus = await getBookingWindowStatus(userId);
  if (!windowStatus.allowed) {
    throw new AppError('Dormitory booking is not currently open', 403);
  }

  const student = await findStudent(userId);
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
    await Invoice.findByIdAndUpdate(invoice._id, { payment_status: 'cancelled' });
    await BookingRequest.findByIdAndUpdate(booking._id, { status: 'cancelled' });

    const msg = err?.message || 'Failed to create PayOS payment link';
    throw new AppError(msg, 500);
  }
};

// ─── 9. checkPaymentStatus ────────────────────────────────
const checkPaymentStatus = async (bookingId, userId) => {
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
    await Invoice.findByIdAndUpdate(booking.invoice, { payment_status: 'cancelled' });
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
      await cancelBooking(bookingId, userId);
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

  // Update bed
  bed.status = 'occupied';
  await bed.save();

  // Create contract if not exists
  let contract = await Contract.findOne({
    student: student._id,
    semester: booking.semester,
    status: 'active',
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
      status: 'active',
    });
  }

  // Update booking
  booking.status = 'approved';
  await booking.save();

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
const handlePayosWebhook = async (webhookData) => {
  const data = webhookData?.data || webhookData;
  const orderCode = data?.orderCode || data?.order_code;
  const status = String(data?.status || data?.paymentStatus || '').toLowerCase();

  if (!orderCode) return { ok: true, ignored: true, reason: 'missing orderCode' };

  const payment = await Payment.findOne({ payos_order_code: Number(orderCode) });
  if (!payment) return { ok: true, ignored: true, reason: 'payment not found' };

  if (payment.payment_status === 'completed')
    return { ok: true, ignored: true, reason: 'already completed' };
  if (['cancelled', 'expired'].includes(payment.payment_status))
    return { ok: true, ignored: true, reason: 'already closed' };

  const booking = await BookingRequest.findOne({ invoice: payment.invoice });
  if (!booking) return { ok: true, ignored: true, reason: 'booking not found' };

  const student = await Student.findById(payment.student).lean();
  if (!student) return { ok: true, ignored: true, reason: 'student not found' };

  if (status === 'paid' || status === 'success' || status === 'completed') {
    // Re-use checkPaymentStatus() which finalizes booking + sends email.
    return checkPaymentStatus(booking._id.toString(), student.user.toString());
  }

  if (status === 'cancelled' || status === 'canceled') {
    try {
      await cancelBooking(booking._id.toString(), student.user.toString());
    } catch (err) {
      console.error('[PayOS Webhook] cancelBooking failed:', err?.message || err);
    }
    return { ok: true, handled: true, status: 'cancelled' };
  }

  return { ok: true, ignored: true, status };
};

// ─── 11. cancelBooking ────────────────────────────────────
const cancelBooking = async (bookingId, userId) => {
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
    await Payment.updateOne({ _id: payment._id }, { $set: { payment_status: 'cancelled' } });
  }

  // Rollback bed and restore room available_beds
  await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
  await Room.findByIdAndUpdate(booking.room, {
    $inc: { available_beds: 1 },
    $set: { status: 'available' },
  });
  // Cancel invoice
  await Invoice.findByIdAndUpdate(booking.invoice, { payment_status: 'cancelled' });
  // Cancel booking
  booking.status = 'cancelled';
  await booking.save();

  return booking;
};

// ─── 12. keepBed ──────────────────────────────────────────
const keepBed = async (userId) => {
  // Must be in hold window
  const windowStatus = await getBookingWindowStatus(userId);
  if (!windowStatus.allowed || windowStatus.window_type !== 'hold') {
    throw new AppError('Bed hold period is not currently active', 403);
  }

  const student = await findStudent(userId);
  const nextSem = await getTargetSemester();

  // Check no existing booking for next semester
  const existingBooking = await BookingRequest.findOne({
    student: student._id,
    semester: nextSem.semester,
    status: { $in: ['awaiting_payment', 'approved'] },
  });
  if (existingBooking) {
    throw new AppError('You already have an active booking for the next semester', 409);
  }

  // Find active contract
  const contract = await Contract.findOne({ student: student._id, status: 'active' })
    .populate({
      path: 'room',
      populate: { path: 'block', populate: { path: 'dorm', select: 'dorm_name dorm_code' } },
    })
    .populate('bed', 'bed_number');
  if (!contract) throw new AppError('No active contract found', 404);

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

  try {
    const returnUrl = process.env.PAYOS_RETURN_URL;
    const cancelUrl = process.env.PAYOS_CANCEL_URL;
    if (!returnUrl || !cancelUrl) {
      return { booking: populatedBooking, invoice, payos: null, payment: null };
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
    await Invoice.findByIdAndUpdate(invoice._id, { payment_status: 'cancelled' });
    await BookingRequest.findByIdAndUpdate(booking._id, { status: 'cancelled' });
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

  const contract = await Contract.findOne({ student: student._id, status: 'active' })
    .populate({
      path: 'room',
      select: 'room_number room_type floor price_per_semester',
      populate: {
        path: 'block',
        select: 'block_name block_code',
        populate: { path: 'dorm', select: 'dorm_name dorm_code' },
      },
    })
    .populate('bed', 'bed_number')
    .lean();

  return {
    student: {
      id: student._id,
      full_name: student.full_name,
      student_code: student.student_code,
      gender: student.gender,
      student_type: student.student_type,
      email: student.user?.email,
    },
    active_contract: contract
      ? {
          id: contract._id,
          semester: contract.semester,
          start_date: contract.start_date,
          end_date: contract.end_date,
          room_price: contract.room_price,
          status: contract.status,
          room: contract.room,
          bed: contract.bed,
        }
      : null,
  };
};

// ─── 14. checkoutStudent (manager) ────────────────────────
const checkoutStudent = async (studentCode, managerId) => {
  if (!studentCode) throw new AppError('student_code is required', 400);

  const student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${studentCode}$`, 'i') },
  });
  if (!student) throw new AppError('Student not found', 404);

  const contract = await Contract.findOne({ student: student._id, status: 'active' });
  if (!contract) throw new AppError('No active contract found for this student', 404);

  const now = new Date();

  // Terminate contract
  await Contract.findByIdAndUpdate(contract._id, {
    $set: { status: 'terminated', terminated_at: now },
  });

  // Free up bed
  await Bed.findByIdAndUpdate(contract.bed, { $set: { status: 'available' } });

  // Restore room available_beds
  await Room.findByIdAndUpdate(contract.room, {
    $inc: { available_beds: 1 },
    $set: { status: 'available' },
  });

  // Update the approved booking request with checkout_date
  await BookingRequest.findOneAndUpdate(
    { student: student._id, semester: contract.semester, status: 'approved', checkout_date: null },
    { $set: { checkout_date: now } },
    { sort: { requested_at: -1 } }
  );

  // Notify student
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

// ─── 15. getRoommates (student) ───────────────────────────
const getRoommates = async (userId, bookingId) => {
  const student = await findStudent(userId);

  const booking = await BookingRequest.findById(bookingId).lean();
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.student.toString() !== student._id.toString()) {
    throw new AppError('Forbidden', 403);
  }

  const roommates = await BookingRequest.find({
    room: booking.room,
    semester: booking.semester,
    status: 'approved',
  })
    .populate('student', 'student_code full_name phone')
    .populate('bed', 'bed_number')
    .lean();

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
      .populate('invoice', 'invoice_code total_amount payment_status')
      .sort({ requested_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    BookingRequest.countDocuments(filter),
  ]);

  return {
    items: items.map((i) => ({ ...i, id: i._id })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
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
  handlePayosWebhook,
  getRoommates,
};
