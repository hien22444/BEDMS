/**
 * Script: fixPhoneNumbers.js
 * Mục đích: Chuẩn hóa số điện thoại của tất cả student về định dạng 10 số, bắt đầu bằng số 0
 *
 * Cách chạy:
 *   node src/seeds/fixPhoneNumbers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/student.model');

/**
 * Chuẩn hóa số điện thoại về 10 số bắt đầu bằng 0
 * Xử lý các định dạng phổ biến:
 *   - "912345678"        (9 số, thiếu 0 đầu)    → "0912345678"
 *   - "+84912345678"     (có mã quốc gia +84)    → "0912345678"
 *   - "84912345678"      (có mã quốc gia 84)     → "0912345678"
 *   - "0912345678"       (đã đúng)               → "0912345678"
 */
function normalizePhone(phone) {
  if (!phone) return phone;

  // Xóa mọi ký tự không phải số
  let digits = phone.replace(/\D/g, '');

  // Xử lý mã quốc gia +84 hoặc 84
  if (digits.startsWith('84') && digits.length === 11) {
    digits = '0' + digits.slice(2);
  }

  // Thiếu số 0 ở đầu (9 chữ số)
  if (digits.length === 9 && !digits.startsWith('0')) {
    digits = '0' + digits;
  }

  return digits;
}

async function fixPhoneNumbers() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Đã kết nối MongoDB\n');

  const students = await Student.find({ phone: { $exists: true, $ne: null, $ne: '' } });

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const student of students) {
    const original = student.phone;
    const normalized = normalizePhone(original);

    if (normalized === original) {
      skipped++;
      continue;
    }

    if (!normalized || normalized.length !== 10 || !normalized.startsWith('0')) {
      console.warn(
        `[SKIP] ${student.student_code} | "${original}" → "${normalized}" (không hợp lệ sau chuẩn hóa)`
      );
      errors++;
      continue;
    }

    console.log(`[UPDATE] ${student.student_code} | "${original}" → "${normalized}"`);
    student.phone = normalized;
    await student.save();
    updated++;
  }

  console.log('\n========== KẾT QUẢ ==========');
  console.log(`Tổng sinh viên có SĐT : ${students.length}`);
  console.log(`Đã cập nhật           : ${updated}`);
  console.log(`Đã đúng, bỏ qua       : ${skipped}`);
  console.log(`Không thể chuẩn hóa   : ${errors}`);
  console.log('==============================');

  await mongoose.disconnect();
  console.log('\nĐã ngắt kết nối MongoDB.');
}

fixPhoneNumbers().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
