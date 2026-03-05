const {
  BookingRequest,
  Room,
  Bed,
  Block,
  Dorm,
  Student,
  User,
  Invoice,
  Payment,
  Contract,
  Notification,
} = require('../models');
const AppError = require('../utils/AppError');

// ─── Semester Logic ───────────────────────────────────────
const getNextSemester = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month <= 4) {
    return { semester: `Summer-${year}`, start_date: new Date(year, 4, 1), end_date: new Date(year, 7, 31) };
  }
  if (month <= 8) {
    return { semester: `Fall-${year}`, start_date: new Date(year, 8, 1), end_date: new Date(year, 11, 31) };
  }
  return { semester: `Spring-${year + 1}`, start_date: new Date(year + 1, 0, 1), end_date: new Date(year + 1, 3, 30) };
};

// ─── Student Filter Logic ─────────────────────────────────
const getStudentFilter = (student) => ({
  roomStudentType: student.student_type === 'international' ? 'international' : 'vietnamese',
  genderTypes:
    student.gender === 'male' ? ['male', 'mixed'] :
    student.gender === 'female' ? ['female', 'mixed'] :
    ['mixed'],
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

// ─── 1. getNextSemesterInfo ───────────────────────────────
const getNextSemesterInfo = async (userId) => {
  await findStudent(userId);
  return getNextSemester();
};

// ─── 2. getAvailableRoomTypes ─────────────────────────────
const getAvailableRoomTypes = async (userId) => {
  const student = await findStudent(userId);
  const { roomStudentType, genderTypes } = getStudentFilter(student);

  const blocks = await Block.find({ gender_type: { $in: genderTypes }, is_active: true }).select('_id');
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
      dormMap[dormId] = { dorm_id: dormId, dorm_name: dorm.dorm_name, dorm_code: dorm.dorm_code, available_slots: 0 };
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
    blockMap[b._id.toString()] = { block_id: b._id.toString(), block_name: b.block_name, block_code: b.block_code, available_slots: 0 };
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

  const nextSem = getNextSemester();

  // Check for existing active booking
  const existingBooking = await BookingRequest.findOne({
    student: student._id,
    semester: nextSem.semester,
    status: { $in: ['awaiting_payment', 'approved'] },
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
      select: 'room_number room_type floor total_beds available_beds price_per_semester student_type',
      populate: {
        path: 'block',
        select: 'block_name block_code gender_type',
        populate: { path: 'dorm', select: 'dorm_name dorm_code' },
      },
    })
    .populate('bed', 'bed_number');

  return { booking: populatedBooking, invoice };
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
    const populatedBooking = await BookingRequest.findById(bookingId)
      .populate({
        path: 'room',
        populate: { path: 'block', populate: { path: 'dorm', select: 'dorm_name' } },
      })
      .populate('bed', 'bed_number')
      .populate('invoice');
    return { booking: populatedBooking, status: 'approved' };
  }

  if (booking.status !== 'awaiting_payment') {
    throw new AppError('Booking is not awaiting payment', 400);
  }

  // Check expiration
  if (new Date() > booking.expires_at) {
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

  // ── Simulated payment confirmation ──
  const invoice = await Invoice.findById(booking.invoice);
  const bed = await Bed.findById(booking.bed);
  const room = await Room.findById(booking.room);

  // Create payment record
  const transaction_code = `TXN-${Date.now()}`;
  const payment = await Payment.create({
    transaction_code,
    invoice: invoice._id,
    student: student._id,
    amount: invoice.total_amount,
    payment_method: 'bank_transfer',
    payment_status: 'completed',
    paid_at: new Date(),
  });

  // Update invoice
  invoice.payment_status = 'paid';
  invoice.paid_at = new Date();
  await invoice.save();

  // Update bed (available_beds already decremented at submitBooking)
  bed.status = 'occupied';
  await bed.save();

  // Create contract
  const contract = await Contract.create({
    student: student._id,
    room: booking.room,
    bed: booking.bed,
    semester: booking.semester,
    start_date: booking.start_date,
    end_date: booking.end_date,
    room_price: room.price_per_semester,
    status: 'active',
  });

  // Update booking
  booking.status = 'approved';
  await booking.save();

  // Notify student
  const user = await User.findById(student.user);
  if (user) {
    await Notification.create({
      user: user._id,
      title: 'Booking Confirmed',
      message: `Your booking for room ${room.room_number} (Bed ${bed.bed_number}) has been confirmed for ${booking.semester}.`,
      notification_type: 'success',
      category: 'booking',
      related_id: booking._id.toString(),
    });
  }

  const populatedBooking = await BookingRequest.findById(bookingId)
    .populate({
      path: 'room',
      populate: { path: 'block', populate: { path: 'dorm', select: 'dorm_name' } },
    })
    .populate('bed', 'bed_number')
    .populate('invoice');

  return { booking: populatedBooking, invoice, payment, contract };
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

  return {
    items: items.map((i) => ({ ...i, id: i._id })),
    pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
  };
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

// ─── 12. getAllBookings (manager) ──────────────────────────
const getAllBookings = async (query = {}) => {
  const { status, semester, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;
  if (semester) filter.semester = semester;

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
    pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = {
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
  getAllBookings,
};
