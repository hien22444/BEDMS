/**
 * sync-active-contracts.js
 *
 * Đồng bộ lại trạng thái giường dựa trên contract thực tế:
 *  - Contract active/extended  → bed phải là 'occupied'
 *  - Contract upcoming         → bed phải là 'reserved'
 *  - Không có contract nào     → bed giữ nguyên (không can thiệp)
 *
 * Chạy: node scripts/sync-active-contracts.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

// ── Inline schemas ─────────────────────────────────────────────────────────

const BedSchema = new mongoose.Schema(
  {
    bed_id: Number,
    room: { type: mongoose.Types.ObjectId, ref: 'Room' },
    bed_number: String,
    status: { type: String, enum: ['available', 'occupied', 'maintenance', 'reserved'] },
  },
  { timestamps: true }
);
const Bed = mongoose.models.Bed || mongoose.model('Bed', BedSchema);

const RoomSchema = new mongoose.Schema(
  {
    room_number: String,
    total_beds: Number,
    available_beds: Number,
    status: { type: String, enum: ['available', 'full', 'maintenance', 'inactive'] },
  },
  { timestamps: true }
);
const Room = mongoose.models.Room || mongoose.model('Room', RoomSchema);

const ContractSchema = new mongoose.Schema(
  {
    student: mongoose.Types.ObjectId,
    room: mongoose.Types.ObjectId,
    bed: mongoose.Types.ObjectId,
    semester: String,
    start_date: Date,
    end_date: Date,
    status: { type: String, enum: ['active', 'expired', 'terminated', 'extended', 'upcoming'] },
  },
  { timestamps: true }
);
const Contract = mongoose.models.Contract || mongoose.model('Contract', ContractSchema);

// ── Helper: sync room.available_beds từ thực tế ────────────────────────────
async function syncRoom(roomId) {
  const room = await Room.findById(roomId);
  if (!room) return;
  const availableCount = await Bed.countDocuments({ room: roomId, status: 'available' });
  const occupiedCount  = await Bed.countDocuments({ room: roomId, status: 'occupied' });
  room.available_beds = availableCount;
  if (occupiedCount === room.total_beds) room.status = 'full';
  else if (room.status === 'full') room.status = 'available';
  await room.save();
  return { availableCount, occupiedCount, roomStatus: room.status };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  // 1. Contract active/extended → bed phải 'occupied'
  const activeContracts = await Contract.find({
    status: { $in: ['active', 'extended'] },
  }).lean();
  console.log(`Found ${activeContracts.length} active/extended contract(s).`);

  // 2. Contract upcoming → bed phải 'reserved'
  const upcomingContracts = await Contract.find({ status: 'upcoming' }).lean();
  console.log(`Found ${upcomingContracts.length} upcoming contract(s).\n`);

  const affectedRooms = new Set();
  let fixed = 0;

  // Fix active/extended → occupied
  for (const c of activeContracts) {
    const bed = await Bed.findById(c.bed);
    if (!bed) { console.log(`  [WARN] Bed ${c.bed} not found (contract ${c._id})`); continue; }

    if (bed.status !== 'occupied') {
      console.log(`  [FIX] Contract ${c._id} (${c.semester}) — Bed ${bed.bed_number}: ${bed.status} → occupied`);
      await Bed.findByIdAndUpdate(c.bed, { $set: { status: 'occupied' } });
      affectedRooms.add(String(c.room));
      fixed++;
    }
  }

  // Fix upcoming → reserved (chỉ khi bed đang 'available', không ghi đè 'occupied')
  for (const c of upcomingContracts) {
    const bed = await Bed.findById(c.bed);
    if (!bed) { console.log(`  [WARN] Bed ${c.bed} not found (contract ${c._id})`); continue; }

    if (bed.status === 'available') {
      console.log(`  [FIX] Contract ${c._id} (${c.semester}, upcoming) — Bed ${bed.bed_number}: available → reserved`);
      await Bed.findByIdAndUpdate(c.bed, { $set: { status: 'reserved' } });
      affectedRooms.add(String(c.room));
      fixed++;
    }
  }

  // Sync rooms
  if (affectedRooms.size > 0) {
    console.log(`\nSyncing ${affectedRooms.size} room(s)...`);
    for (const roomId of affectedRooms) {
      const result = await syncRoom(roomId);
      const room = await Room.findById(roomId).lean();
      console.log(`  Room ${room?.room_number ?? roomId}: available=${result.availableCount}, occupied=${result.occupiedCount}/${room?.total_beds}, status=${result.roomStatus}`);
    }
  }

  console.log('\n══════════════════════════');
  console.log(`Total fixed: ${fixed}`);
  if (fixed === 0) console.log('Everything is already in sync.');
  console.log('Done.');
}

main()
  .catch((err) => { console.error('Script failed:', err); process.exit(1); })
  .finally(() => mongoose.disconnect());
