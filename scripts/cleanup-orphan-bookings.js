/**
 * Script: cleanup-orphan-bookings.js
 * Tìm booking có room/bed ObjectId trỏ đến document đã bị xóa (dangling ref),
 * đếm trước rồi xóa.
 *
 * Chạy: node scripts/cleanup-orphan-bookings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { BookingRequest, Invoice, Payment, Room, Bed } = require('../src/models');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Lấy tất cả booking có room hoặc bed field
  const allBookings = await BookingRequest.find({
    $or: [
      { room: { $ne: null, $exists: true } },
      { bed:  { $ne: null, $exists: true } },
    ],
  }).select('_id room bed status semester invoice').lean();

  console.log(`Tổng booking có room/bed field: ${allBookings.length}`);

  // Lấy tất cả room/bed ID đang tồn tại
  const existingRoomIds = new Set(
    (await Room.find({}).select('_id').lean()).map((r) => r._id.toString())
  );
  const existingBedIds = new Set(
    (await Bed.find({}).select('_id').lean()).map((b) => b._id.toString())
  );

  // Tìm các booking có dangling reference
  const orphans = allBookings.filter((b) => {
    const roomMissing = b.room && !existingRoomIds.has(b.room.toString());
    const bedMissing  = b.bed  && !existingBedIds.has(b.bed.toString());
    return roomMissing || bedMissing;
  });

  console.log(`\nBooking có room/bed trỏ đến document đã bị xóa: ${orphans.length}`);

  if (orphans.length === 0) {
    // Thử thêm: booking null room/bed hoàn toàn
    const nullQuery = await BookingRequest.countDocuments({
      $or: [{ room: null }, { bed: null }],
    });
    console.log(`Booking có room=null hoặc bed=null: ${nullQuery}`);
    console.log('\nKhông có gì cần xóa.');
    process.exit(0);
  }

  // Phân theo status
  const byStatus = {};
  orphans.forEach((b) => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  });
  console.log('Phân theo status:', byStatus);

  const bookingIds = orphans.map((b) => b._id);
  const invoiceIds = orphans.map((b) => b.invoice).filter(Boolean);

  console.log(`\nSẽ xóa:`);
  console.log(`  BookingRequests : ${bookingIds.length}`);
  console.log(`  Invoices liên quan: ${invoiceIds.length}`);

  const delPayments = await Payment.deleteMany({ invoice: { $in: invoiceIds } });
  const delInvoices = await Invoice.deleteMany({ _id: { $in: invoiceIds } });
  const delBookings = await BookingRequest.deleteMany({ _id: { $in: bookingIds } });

  console.log(`\nĐã xóa:`);
  console.log(`  Payments  : ${delPayments.deletedCount}`);
  console.log(`  Invoices  : ${delInvoices.deletedCount}`);
  console.log(`  Bookings  : ${delBookings.deletedCount}`);
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
