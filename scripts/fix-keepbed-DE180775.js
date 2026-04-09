/**
 * Script: fix-keepbed-DE180775.js
 * Mục đích: Cancel keepbed booking sai của sinh viên DE180775 để họ có thể
 *           thực hiện lại quy trình giữ giường đúng.
 *
 * Chạy: node scripts/fix-keepbed-DE180775.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
  Student,
  BookingRequest,
  Invoice,
  Payment,
  Contract,
  Bed,
  Room,
} = require('../src/models');

const STUDENT_CODE = 'DE180775';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Tìm sinh viên
  const student = await Student.findOne({ student_code: STUDENT_CODE }).lean();
  if (!student) {
    console.error(`Không tìm thấy sinh viên ${STUDENT_CODE}`);
    process.exit(1);
  }
  console.log(`Sinh viên: ${student.full_name} (${student.student_code})`);

  // 2. Tìm booking hiện tại đang active (approved + end_date > now)
  const now = new Date();
  const activeBooking = await BookingRequest.findOne({
    student: student._id,
    status: 'approved',
    end_date: { $gt: now },
  })
    .populate('invoice')
    .lean();

  if (activeBooking) {
    console.log(`Active booking hiện tại: ${activeBooking.semester} (id: ${activeBooking._id})`);
  } else {
    console.log('Không có active booking hiện tại.');
  }

  // 3. Tìm TẤT CẢ booking khác (approved hoặc awaiting_payment) KHÔNG phải active
  const keepBedBookings = await BookingRequest.find({
    student: student._id,
    status: { $in: ['approved', 'awaiting_payment'] },
    _id: { $ne: activeBooking?._id ?? null },
  })
    .populate('invoice')
    .lean();

  if (keepBedBookings.length === 0) {
    console.log('Không có keepbed booking nào cần fix.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nTìm thấy ${keepBedBookings.length} keepbed booking cần cancel:`);

  for (const booking of keepBedBookings) {
    console.log(`\n--- Booking: ${booking.semester} | status: ${booking.status} | id: ${booking._id}`);

    // Cancel booking
    await BookingRequest.findByIdAndUpdate(booking._id, { status: 'cancelled' });
    console.log('  ✓ Booking → cancelled');

    // Cancel invoice
    if (booking.invoice) {
      await Invoice.findByIdAndUpdate(booking.invoice._id, { payment_status: 'cancelled' });
      console.log(`  ✓ Invoice ${booking.invoice.invoice_code} → cancelled`);
    }

    // Cancel payment records
    const cancelledPayments = await Payment.updateMany(
      { invoice: booking.invoice?._id, payment_status: { $in: ['pending', 'completed'] } },
      { payment_status: 'cancelled' }
    );
    if (cancelledPayments.modifiedCount > 0) {
      console.log(`  ✓ ${cancelledPayments.modifiedCount} payment record(s) → cancelled`);
    }

    // Cancel contract (nếu có cho semester này)
    const cancelledContracts = await Contract.updateMany(
      {
        student: student._id,
        semester: booking.semester,
        status: { $in: ['active', 'extended'] },
      },
      { status: 'terminated', terminated_at: new Date() }
    );
    if (cancelledContracts.modifiedCount > 0) {
      console.log(`  ✓ ${cancelledContracts.modifiedCount} contract(s) → terminated`);
    }

    // Release bed (nếu bị reserve do booking này)
    if (booking.bed) {
      const bed = await Bed.findById(booking.bed);
      if (bed && bed.status === 'reserved') {
        await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
        await Room.findByIdAndUpdate(booking.room, { $inc: { available_beds: 1 } });
        console.log(`  ✓ Bed released → available`);
      }
    }
  }

  console.log('\n✅ Fix hoàn tất! Sinh viên DE180775 có thể thực hiện keepbed lại.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
