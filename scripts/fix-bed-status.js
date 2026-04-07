/**
 * fix-bed-status.js
 *
 * Script sửa trạng thái giường không đồng bộ với booking đã được approve.
 *
 * Logic:
 *  1. Tìm tất cả BookingRequest có status = 'approved'
 *  2. Với mỗi booking, kiểm tra bed tương ứng:
 *     - Nếu bed KHÔNG phải 'occupied' → cập nhật thành 'occupied'
 *  3. Kiểm tra Contract tương ứng có tồn tại không:
 *     - Nếu chưa có → tạo Contract mới với status = 'active'
 *  4. Sync lại room.available_beds theo đếm thực tế các bed 'available'
 *     và cập nhật room.status nếu cần
 *
 * Chạy: node scripts/fix-bed-status.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

// ── Inline schemas (không import từ src để script độc lập) ──────────────────

const BedSchema = new mongoose.Schema(
  {
    bed_id: Number,
    room: { type: mongoose.Types.ObjectId, ref: 'Room' },
    bed_number: String,
    status: {
      type: String,
      default: 'available',
      enum: ['available', 'occupied', 'maintenance', 'reserved'],
    },
  },
  { timestamps: true }
);
const Bed = mongoose.models.Bed || mongoose.model('Bed', BedSchema);

const RoomSchema = new mongoose.Schema(
  {
    block: mongoose.Types.ObjectId,
    room_number: String,
    floor: Number,
    room_type: String,
    total_beds: Number,
    available_beds: Number,
    price_per_semester: Number,
    status: {
      type: String,
      default: 'available',
      enum: ['available', 'full', 'maintenance', 'inactive'],
    },
    has_private_bathroom: Boolean,
    student_type: String,
    description: String,
  },
  { timestamps: true }
);
const Room = mongoose.models.Room || mongoose.model('Room', RoomSchema);

const BookingRequestSchema = new mongoose.Schema(
  {
    student: mongoose.Types.ObjectId,
    room: mongoose.Types.ObjectId,
    bed: mongoose.Types.ObjectId,
    invoice: mongoose.Types.ObjectId,
    semester: String,
    start_date: Date,
    end_date: Date,
    status: {
      type: String,
      enum: ['awaiting_payment', 'approved', 'cancelled', 'expired'],
    },
    note: String,
    expires_at: Date,
    requested_at: Date,
    reviewed_at: Date,
    reviewed_by: mongoose.Types.ObjectId,
    checkout_date: Date,
  },
  { timestamps: true }
);
const BookingRequest =
  mongoose.models.BookingRequest ||
  mongoose.model('BookingRequest', BookingRequestSchema);

const ContractSchema = new mongoose.Schema(
  {
    student: mongoose.Types.ObjectId,
    room: mongoose.Types.ObjectId,
    bed: mongoose.Types.ObjectId,
    semester: String,
    start_date: Date,
    end_date: Date,
    room_price: Number,
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'expired', 'terminated', 'extended'],
    },
    contract_url: String,
    signed_at: Date,
    terminated_at: Date,
    created_by: mongoose.Types.ObjectId,
  },
  { timestamps: true }
);
const Contract =
  mongoose.models.Contract || mongoose.model('Contract', ContractSchema);

// ── Helper: sync room.available_beds từ thực tế ────────────────────────────
async function syncRoomAvailability(roomId) {
  const room = await Room.findById(roomId);
  if (!room) return;

  const availableCount = await Bed.countDocuments({
    room: roomId,
    status: 'available',
  });
  room.available_beds = availableCount;

  const occupiedCount = await Bed.countDocuments({
    room: roomId,
    status: 'occupied',
  });

  if (occupiedCount === room.total_beds) {
    room.status = 'full';
  } else if (room.status === 'full') {
    room.status = 'available';
  }

  await room.save();
  return { availableCount, occupiedCount, roomStatus: room.status };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  // 1. Lấy tất cả booking đã approve
  const approvedBookings = await BookingRequest.find({ status: 'approved' });
  console.log(`Found ${approvedBookings.length} approved booking(s).\n`);

  if (approvedBookings.length === 0) {
    console.log('Nothing to fix.');
    return;
  }

  const affectedRoomIds = new Set();
  let bedFixed = 0;
  let contractCreated = 0;

  for (const booking of approvedBookings) {
    console.log(`─── Booking ${booking._id} (student: ${booking.student}) ───`);

    if (!booking.bed) {
      console.log('  [SKIP] Booking has no bed assigned.');
      continue;
    }

    // 2. Kiểm tra bed
    const bed = await Bed.findById(booking.bed);
    if (!bed) {
      console.log(`  [WARN] Bed ${booking.bed} not found in DB.`);
      continue;
    }

    console.log(`  Bed ${bed.bed_id || bed._id} (number: ${bed.bed_number}) — current status: ${bed.status}`);

    if (bed.status !== 'occupied') {
      const oldStatus = bed.status;
      bed.status = 'occupied';
      await bed.save();
      console.log(`  [FIXED] Bed status: ${oldStatus} → occupied`);
      bedFixed++;
      affectedRoomIds.add(booking.room.toString());
    } else {
      console.log('  [OK] Bed already occupied.');
    }

    // 3. Kiểm tra Contract
    const existingContract = await Contract.findOne({
      student: booking.student,
      bed: booking.bed,
      semester: booking.semester,
      status: { $in: ['active', 'extended'] },
    });

    if (!existingContract) {
      const room = await Room.findById(booking.room);
      await Contract.create({
        student: booking.student,
        room: booking.room,
        bed: booking.bed,
        semester: booking.semester,
        start_date: booking.start_date,
        end_date: booking.end_date,
        room_price: room?.price_per_semester ?? 0,
        status: 'active',
      });
      console.log(`  [CREATED] Contract cho student ${booking.student} — semester ${booking.semester}`);
      contractCreated++;
    } else {
      console.log(`  [OK] Contract đã tồn tại (${existingContract._id}).`);
    }
  }

  // 4. Sync room.available_beds cho các phòng bị ảnh hưởng
  if (affectedRoomIds.size > 0) {
    console.log(`\nSyncing available_beds for ${affectedRoomIds.size} room(s)...`);
    for (const roomId of affectedRoomIds) {
      const result = await syncRoomAvailability(roomId);
      const room = await Room.findById(roomId).lean();
      console.log(
        `  Room ${room?.room_number ?? roomId}: available_beds=${result.availableCount}, ` +
          `occupied=${result.occupiedCount}/${room?.total_beds}, status=${result.roomStatus}`
      );
    }
  }

  console.log('\n═══════════════════════════════');
  console.log(`Beds fixed      : ${bedFixed}`);
  console.log(`Contracts created: ${contractCreated}`);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
