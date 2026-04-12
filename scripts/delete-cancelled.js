/**
 * Script: delete-cancelled.js
 * Xóa tất cả bản ghi có trạng thái cancelled khỏi database:
 *   - Invoice        (payment_status = 'cancelled')
 *   - Payment        (payment_status = 'cancelled')
 *   - BookingRequest (status = 'cancelled')
 *
 * Chạy:
 *   node scripts/delete-cancelled.js            ← dry-run (chỉ đếm)
 *   node scripts/delete-cancelled.js --confirm  ← xóa thật
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Invoice = require('../src/models/invoice.model');
const Payment = require('../src/models/payment.model');
const BookingRequest = require('../src/models/bookingRequest.model');

const isDryRun = !process.argv.includes('--confirm');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB Connected');

  const [cancelledInvoices, cancelledPayments, cancelledBookings] = await Promise.all([
    Invoice.countDocuments({ payment_status: 'cancelled' }),
    Payment.countDocuments({ payment_status: 'cancelled' }),
    BookingRequest.countDocuments({ status: 'cancelled' }),
  ]);

  console.log('\nTìm thấy:');
  console.log(`  Invoice        (payment_status = 'cancelled'): ${cancelledInvoices}`);
  console.log(`  Payment        (payment_status = 'cancelled'): ${cancelledPayments}`);
  console.log(`  BookingRequest (status = 'cancelled')        : ${cancelledBookings}`);

  if (isDryRun) {
    console.log('\n[DRY-RUN] Không xóa. Chạy lại với --confirm để xóa thật.\n');
    await mongoose.disconnect();
    return;
  }

  const [invoiceResult, paymentResult, bookingResult] = await Promise.all([
    Invoice.deleteMany({ payment_status: 'cancelled' }),
    Payment.deleteMany({ payment_status: 'cancelled' }),
    BookingRequest.deleteMany({ status: 'cancelled' }),
  ]);

  console.log('\nĐã xóa:');
  console.log(`  Invoice        đã xóa: ${invoiceResult.deletedCount}`);
  console.log(`  Payment        đã xóa: ${paymentResult.deletedCount}`);
  console.log(`  BookingRequest đã xóa: ${bookingResult.deletedCount}`);
  console.log('\nHoàn thành.\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi:', err);
  mongoose.disconnect();
  process.exit(1);
});
