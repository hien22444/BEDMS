/**
 * Script chạy trực tiếp bằng mongosh:
 *   mongosh "mongodb+srv://..." --file src/seeds/fixPhone.mongo.js
 */

const db = db.getSiblingDB('test'); // MongoDB sẽ tự chọn DB từ URI nếu có

const students = db.students.find({
  phone: { $exists: true, $ne: null, $ne: '' }
}).toArray();

let updated = 0;
let skipped = 0;

students.forEach((student) => {
  const original = student.phone;
  let digits = original.replace(/\D/g, '');

  // Xử lý mã quốc gia 84 hoặc +84
  if (digits.startsWith('84') && digits.length === 11) {
    digits = '0' + digits.slice(2);
  }

  // Thêm 0 nếu 9 chữ số và không bắt đầu bằng 0
  if (digits.length === 9 && !digits.startsWith('0')) {
    digits = '0' + digits;
  }

  if (digits === original) {
    skipped++;
    return;
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    db.students.updateOne(
      { _id: student._id },
      { $set: { phone: digits } }
    );
    print(`[UPDATE] ${student.student_code} | "${original}" → "${digits}"`);
    updated++;
  } else {
    print(`[SKIP]   ${student.student_code} | "${original}" → "${digits}" (không hợp lệ)`);
  }
});

print('\n========== KẾT QUẢ ==========');
print(`Đã cập nhật : ${updated}`);
print(`Bỏ qua      : ${skipped}`);
