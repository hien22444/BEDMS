/**
 * Fix checkout for student whose checkout_date was not set.
 * Run: node src/seeds/fixCheckout.js <student_code>
 * Example: node src/seeds/fixCheckout.js DE180775
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connect } = require('../utils/connection');
const Student = require('../models/student.model');
const Contract = require('../models/contract.model');
const BookingRequest = require('../models/bookingRequest.model');
const Bed = require('../models/bed.model');
const Room = require('../models/room.model');

const studentCode = process.argv[2];

if (!studentCode) {
  console.error('Usage: node src/seeds/fixCheckout.js <student_code>');
  process.exit(1);
}

const run = async () => {
  await connect();

  const student = await Student.findOne({
    student_code: { $regex: new RegExp(`^${studentCode}$`, 'i') },
  });
  if (!student) {
    console.error(`Student not found: ${studentCode}`);
    process.exit(1);
  }
  console.log(`Found student: ${student.full_name} (${student.student_code})`);

  // Find the approved booking without checkout_date
  const booking = await BookingRequest.findOne({
    student: student._id,
    status: 'approved',
    checkout_date: null,
  }).sort({ requested_at: -1 });

  if (!booking) {
    console.log('No approved booking without checkout_date found. Nothing to fix.');
    process.exit(0);
  }
  console.log(`Found booking: semester=${booking.semester}, bed=${booking.bed}`);

  const now = new Date();

  // Set checkout_date on booking
  await BookingRequest.findByIdAndUpdate(booking._id, {
    $set: { checkout_date: now },
  });
  console.log(`✅ Set checkout_date = ${now.toLocaleString('vi-VN')} on booking`);

  // Terminate contract if still active
  const contract = await Contract.findOne({ student: student._id, status: 'active' });
  if (contract) {
    await Contract.findByIdAndUpdate(contract._id, {
      $set: { status: 'terminated', terminated_at: now },
    });
    await Bed.findByIdAndUpdate(contract.bed, { $set: { status: 'available' } });
    await Room.findByIdAndUpdate(contract.room, {
      $inc: { available_beds: 1 },
      $set: { status: 'available' },
    });
    console.log(`✅ Terminated contract (semester=${contract.semester})`);
    console.log(`✅ Freed bed and updated room`);
  } else {
    console.log('ℹ️  No active contract found (already terminated)');
  }

  console.log('\n✅ Fix completed for student:', studentCode);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
