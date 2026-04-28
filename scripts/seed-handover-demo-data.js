require('dotenv').config();

const mongoose = require('mongoose');
const {
  User,
  Student,
  Staff,
  Dorm,
  Block,
  Room,
  Bed,
  Contract,
  BookingRequest,
  Invoice,
  InvoiceLineItem,
  SystemConfig,
  Notification,
  News,
  EWUsage,
  ChatConversation,
  ChatMessage,
} = require('../src/models');

const REQUIRED_ENV = ['MONGODB_URI'];

const PASSWORDS = {
  manager: 'Manager@123',
  security: 'Security@123',
  studentA: 'Student@123',
  studentB: 'Student2@123',
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const getTargetSemester = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month <= 4) return { semester: 'Summer', year, label: `Summer-${year}` };
  if (month <= 8) return { semester: 'Fall', year, label: `Fall-${year}` };
  return { semester: 'Spring', year: year + 1, label: `Spring-${year + 1}` };
};

const getSemesterDates = (semester, year) => {
  if (semester === 'Spring') {
    return { start: new Date(year, 0, 1), end: new Date(year, 3, 30) };
  }
  if (semester === 'Summer') {
    return { start: new Date(year, 4, 1), end: new Date(year, 7, 31) };
  }
  return { start: new Date(year, 8, 1), end: new Date(year, 11, 31) };
};

const ensureRequiredEnv = () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
};

const ensureUser = async ({ email, role, fullname, password }) => {
  let user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    user = await User.create({
      email: email.toLowerCase().trim(),
      password_hash: password,
      role,
      fullname,
      is_active: true,
    });
    return user;
  }

  user.role = role;
  user.fullname = fullname;
  user.is_active = true;
  if (password) user.password_hash = password;
  await user.save();
  return user;
};

const ensureStudent = async ({ user, student_code, full_name, gender, phone, major, cohort, student_type }) => {
  return Student.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      student_code,
      full_name,
      gender,
      phone,
      major,
      cohort,
      student_type,
      behavioral_score: 8.5,
      dorm_booking_suspended: false,
      is_banned_permanently: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const ensureStaff = async ({ user, staff_code, full_name, phone, position }) => {
  return Staff.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      staff_code,
      full_name,
      phone,
      position,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const ensureSystemConfig = async (config_key, config_value, description, value_type = 'string', updated_by = null) => {
  return SystemConfig.findOneAndUpdate(
    { config_key },
    {
      config_key,
      config_value,
      description,
      value_type,
      updated_by,
      updated_at: new Date(),
    },
    { upsert: true, new: true }
  );
};

const ensureRoom = async ({
  block,
  room_number,
  floor,
  room_type,
  total_beds,
  available_beds,
  price_per_semester,
  status,
  student_type,
}) => {
  return Room.findOneAndUpdate(
    { block: block._id, room_number },
    {
      block: block._id,
      room_number,
      floor,
      room_type,
      total_beds,
      available_beds,
      price_per_semester,
      status,
      student_type,
      has_private_bathroom: true,
      description: 'Seeded room for handover demo',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const ensureBed = async ({ room, bed_number, status }) => {
  return Bed.findOneAndUpdate(
    { room: room._id, bed_number },
    {
      room: room._id,
      bed_number,
      status,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const ensureInvoice = async ({
  invoice_code,
  student,
  room,
  invoice_month,
  room_fee,
  electricity_fee,
  water_fee,
  service_fee,
  other_fees,
  due_date,
  payment_status,
  created_by,
}) => {
  const total_amount = room_fee + electricity_fee + water_fee + service_fee + other_fees;
  return Invoice.findOneAndUpdate(
    { invoice_code },
    {
      invoice_code,
      student: student._id,
      room: room._id,
      invoice_month,
      room_fee,
      electricity_fee,
      water_fee,
      service_fee,
      other_fees,
      total_amount,
      due_date,
      payment_status,
      created_by: created_by?._id || null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const ensureLineItem = async ({ invoice, item_type, description, quantity, unit_price }) => {
  return InvoiceLineItem.findOneAndUpdate(
    { invoice: invoice._id, item_type, description },
    { invoice: invoice._id, item_type, description, quantity, unit_price },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const main = async () => {
  ensureRequiredEnv();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const target = getTargetSemester();
  const semesterDates = getSemesterDates(target.semester, target.year);

  const managerUser = await ensureUser({
    email: 'manager.demo@fpt.edu.vn',
    role: 'manager',
    fullname: 'Manager Demo',
    password: PASSWORDS.manager,
  });
  const securityUser = await ensureUser({
    email: 'security.demo@fpt.edu.vn',
    role: 'security',
    fullname: 'Security Demo',
    password: PASSWORDS.security,
  });
  const studentAUser = await ensureUser({
    email: 'student.demo1@fpt.edu.vn',
    role: 'student',
    fullname: 'Nguyen Van Demo',
    password: PASSWORDS.studentA,
  });
  const studentBUser = await ensureUser({
    email: 'student.demo2@fpt.edu.vn',
    role: 'student',
    fullname: 'Tran Thi Demo',
    password: PASSWORDS.studentB,
  });

  const manager = await ensureStaff({
    user: managerUser,
    staff_code: 'MG001',
    full_name: 'Manager Demo',
    phone: '0900000001',
    position: 'Dormitory Manager',
  });
  await ensureStaff({
    user: securityUser,
    staff_code: 'SC001',
    full_name: 'Security Demo',
    phone: '0900000002',
    position: 'Security Officer',
  });

  const studentA = await ensureStudent({
    user: studentAUser,
    student_code: 'DEMO001',
    full_name: 'Nguyen Van Demo',
    gender: 'male',
    phone: '0911111111',
    major: 'Software Engineering',
    cohort: 'K18',
    student_type: 'domestic',
  });
  const studentB = await ensureStudent({
    user: studentBUser,
    student_code: 'DEMO002',
    full_name: 'Tran Thi Demo',
    gender: 'male',
    phone: '0922222222',
    major: 'Artificial Intelligence',
    cohort: 'K18',
    student_type: 'domestic',
  });

  const dorm = await Dorm.findOneAndUpdate(
    { dorm_code: 'D1' },
    {
      dorm_name: 'Demo Dormitory',
      dorm_code: 'D1',
      total_floors: 3,
      total_blocks: 2,
      description: 'Seeded dormitory for handover demo',
      is_active: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const blockA = await Block.findOneAndUpdate(
    { dorm: dorm._id, block_code: 'A' },
    {
      dorm: dorm._id,
      block_name: 'Block A',
      block_code: 'A',
      floor: 1,
      floor_count: 3,
      total_rooms: 2,
      gender_type: 'male',
      is_active: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const blockB = await Block.findOneAndUpdate(
    { dorm: dorm._id, block_code: 'B' },
    {
      dorm: dorm._id,
      block_name: 'Block B',
      block_code: 'B',
      floor: 1,
      floor_count: 3,
      total_rooms: 1,
      gender_type: 'male',
      is_active: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const roomA101 = await ensureRoom({
    block: blockA,
    room_number: 'A101',
    floor: 1,
    room_type: '4_person',
    total_beds: 4,
    available_beds: 2,
    price_per_semester: 3500000,
    status: 'available',
    student_type: 'vietnamese',
  });

  const roomA102 = await ensureRoom({
    block: blockA,
    room_number: 'A102',
    floor: 1,
    room_type: '4_person',
    total_beds: 4,
    available_beds: 4,
    price_per_semester: 3500000,
    status: 'available',
    student_type: 'vietnamese',
  });

  const roomB201 = await ensureRoom({
    block: blockB,
    room_number: 'B201',
    floor: 2,
    room_type: '2_person',
    total_beds: 2,
    available_beds: 2,
    price_per_semester: 5000000,
    status: 'available',
    student_type: 'vietnamese',
  });

  const bedA101_1 = await ensureBed({ room: roomA101, bed_number: '1', status: 'occupied' });
  const bedA101_2 = await ensureBed({ room: roomA101, bed_number: '2', status: 'occupied' });
  await ensureBed({ room: roomA101, bed_number: '3', status: 'available' });
  await ensureBed({ room: roomA101, bed_number: '4', status: 'available' });

  await ensureBed({ room: roomA102, bed_number: '1', status: 'available' });
  await ensureBed({ room: roomA102, bed_number: '2', status: 'available' });
  await ensureBed({ room: roomA102, bed_number: '3', status: 'available' });
  await ensureBed({ room: roomA102, bed_number: '4', status: 'available' });

  await ensureBed({ room: roomB201, bed_number: '1', status: 'available' });
  await ensureBed({ room: roomB201, bed_number: '2', status: 'maintenance' });

  await Contract.findOneAndUpdate(
    { student: studentA._id, semester: target.label },
    {
      student: studentA._id,
      room: roomA101._id,
      bed: bedA101_1._id,
      semester: target.label,
      start_date: semesterDates.start,
      end_date: semesterDates.end,
      room_price: roomA101.price_per_semester,
      status: 'active',
      signed_at: new Date(),
      created_by: manager._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Contract.findOneAndUpdate(
    { student: studentB._id, semester: target.label },
    {
      student: studentB._id,
      room: roomA101._id,
      bed: bedA101_2._id,
      semester: target.label,
      start_date: semesterDates.start,
      end_date: semesterDates.end,
      room_price: roomA101.price_per_semester,
      status: 'active',
      signed_at: new Date(),
      created_by: manager._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const bookingMonth = `${target.year}-${String(semesterDates.start.getMonth() + 1).padStart(2, '0')}`;
  const invoice = await ensureInvoice({
    invoice_code: `EW-DEMO-${target.year}`,
    student: studentA,
    room: roomA101,
    invoice_month: bookingMonth,
    room_fee: 0,
    electricity_fee: 120000,
    water_fee: 80000,
    service_fee: 50000,
    other_fees: 0,
    due_date: addDays(new Date(), 10),
    payment_status: 'unpaid',
    created_by: manager,
  });

  await ensureLineItem({
    invoice,
    item_type: 'electricity',
    description: `Electricity fee ${bookingMonth}`,
    quantity: 1,
    unit_price: 120000,
  });
  await ensureLineItem({
    invoice,
    item_type: 'water',
    description: `Water fee ${bookingMonth}`,
    quantity: 1,
    unit_price: 80000,
  });
  await ensureLineItem({
    invoice,
    item_type: 'service',
    description: `Service fee ${bookingMonth}`,
    quantity: 1,
    unit_price: 50000,
  });

  await BookingRequest.findOneAndUpdate(
    { student: studentA._id, room: roomA102._id, semester: `${target.semester}-${target.year + 1}` },
    {
      student: studentA._id,
      room: roomA102._id,
      semester: `${target.semester}-${target.year + 1}`,
      start_date: addDays(semesterDates.end, 1),
      end_date: addDays(semesterDates.end, 120),
      status: 'awaiting_payment',
      source: 'new_booking',
      note: 'Seeded booking request for demo',
      requested_at: new Date(),
      invoice: invoice._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const ewDate = new Date(target.year, semesterDates.start.getMonth(), 15);
  await EWUsage.findOneAndUpdate(
    { block: blockA._id, type: 'electric', date: ewDate },
    {
      block: blockA._id,
      dorm: dorm._id,
      block_name: blockA.block_name,
      type: 'electric',
      meter_left: 1000,
      meter_right: 1080,
      consumption: 80,
      date: ewDate,
      term: target.label,
      unit: 'kW',
      amount: 240000,
      price_per_unit: 3000,
      occupied_beds: 2,
      amount_per_bed: 120000,
      is_billed: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await EWUsage.findOneAndUpdate(
    { block: blockA._id, type: 'water', date: ewDate },
    {
      block: blockA._id,
      dorm: dorm._id,
      block_name: blockA.block_name,
      type: 'water',
      meter_left: 500,
      meter_right: 518,
      consumption: 18,
      date: ewDate,
      term: target.label,
      unit: 'm3',
      amount: 162000,
      price_per_unit: 9000,
      occupied_beds: 2,
      amount_per_bed: 81000,
      is_billed: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Notification.findOneAndUpdate(
    { user: studentAUser._id, title: 'Welcome to DMS' },
    {
      user: studentAUser._id,
      title: 'Welcome to DMS',
      message: 'Your handover demo account is ready. You can explore booking, utilities, invoices and chat.',
      notification_type: 'success',
      category: 'general',
      is_read: false,
      created_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await News.findOneAndUpdate(
    { title: 'Welcome to the Dormitory Management System' },
    {
      title: 'Welcome to the Dormitory Management System',
      content: '<p>This is demo content seeded for project handover. You can use it to verify news listing and detail pages.</p>',
      category: 'announcement',
      is_published: true,
      published_at: new Date(),
      created_by: manager._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const conversation = await ChatConversation.findOneAndUpdate(
    { student: studentAUser._id, status: 'open' },
    {
      student: studentAUser._id,
      staff: managerUser._id,
      status: 'open',
      manager_unread: 1,
      student_unread: 0,
      last_message_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ChatMessage.findOneAndUpdate(
    { conversation: conversation._id, sender: studentAUser._id, message_text: 'Hello manager, I need support with my room.' },
    {
      conversation: conversation._id,
      sender: studentAUser._id,
      sender_type: 'student',
      message_text: 'Hello manager, I need support with my room.',
      is_read: false,
      sent_at: addDays(new Date(), -1),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ChatMessage.findOneAndUpdate(
    { conversation: conversation._id, sender: managerUser._id, message_text: 'Sure, please describe the issue and we will help you.' },
    {
      conversation: conversation._id,
      sender: managerUser._id,
      sender_type: 'staff',
      message_text: 'Sure, please describe the issue and we will help you.',
      is_read: true,
      sent_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ensureSystemConfig(
    'booking_hold_window_start',
    addDays(new Date(), -7).toISOString(),
    'Bed hold window start date',
    'string',
    manager._id
  );
  await ensureSystemConfig(
    'booking_hold_window_end',
    addDays(new Date(), 7).toISOString(),
    'Bed hold window end date',
    'string',
    manager._id
  );
  await ensureSystemConfig(
    'booking_new_window_start',
    addDays(new Date(), -7).toISOString(),
    'New booking window start date',
    'string',
    manager._id
  );
  await ensureSystemConfig(
    'booking_new_window_end',
    addDays(new Date(), 14).toISOString(),
    'New booking window end date',
    'string',
    manager._id
  );
  await ensureSystemConfig(
    'booking_target_semester',
    target.semester,
    'Target booking semester',
    'string',
    manager._id
  );
  await ensureSystemConfig(
    'booking_target_year',
    String(target.year),
    'Target booking year',
    'string',
    manager._id
  );
  await ensureSystemConfig(
    'room_type_pricing',
    JSON.stringify({
      '2_person': 5000000,
      '4_person': 3500000,
    }),
    'Room type pricing (per semester)',
    'json',
    manager._id
  );

  console.log('\nSeed completed successfully.\n');
  console.log('Demo accounts:');
  console.log(`- Manager  : manager.demo@fpt.edu.vn / ${PASSWORDS.manager}`);
  console.log(`- Security : security.demo@fpt.edu.vn / ${PASSWORDS.security}`);
  console.log(`- Student A: student.demo1@fpt.edu.vn / ${PASSWORDS.studentA} (code: DEMO001)`);
  console.log(`- Student B: student.demo2@fpt.edu.vn / ${PASSWORDS.studentB} (code: DEMO002)`);
  console.log('\nSeeded demo data:');
  console.log('- 1 dorm, 2 blocks, 3 rooms, 10 beds');
  console.log('- 2 active student contracts');
  console.log('- 1 unpaid utility invoice with line items');
  console.log('- 2 EW usage records (electric/water)');
  console.log('- 1 booking request');
  console.log('- 1 published news item');
  console.log('- 1 welcome notification');
  console.log('- 1 chat conversation with 2 messages');
  console.log('- booking/date configs + room type pricing');
};

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
