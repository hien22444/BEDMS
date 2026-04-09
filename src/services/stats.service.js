const { Dorm, Block, Room } = require('../models');
const Bed = require('../models/bed.model');

// ==================== BED USAGE STATS ====================

const getBedUsageStats = async () => {
  const beds = await Bed.find({})
    .populate({
      path: 'room',
      select: 'room_type student_type price_per_semester block',
      populate: {
        path: 'block',
        select: 'dorm',
        populate: { path: 'dorm', select: 'dorm_name dorm_code' },
      },
    })
    .lean();

  const dormMap = {};
  const roomTypeMap = {};
  const grand = { totalBeds: 0, usedBeds: 0, freeBeds: 0, maintenanceBeds: 0 };

  const countBed = (bucket, status) => {
    bucket.totalBeds++;
    if (status === 'occupied' || status === 'reserved') bucket.usedBeds++;
    else if (status === 'available') bucket.freeBeds++;
    else if (status === 'maintenance') bucket.maintenanceBeds++;
  };

  beds.forEach((bed) => {
    const room = bed.room;
    if (!room || !room.block || !room.block.dorm) return;

    const dorm = room.block.dorm;
    const dormCode = dorm.dorm_code;
    const studentLabel = room.student_type === 'international' ? 'International' : 'Domestic';
    const rtLabel = `${studentLabel} - ${room.room_type} - ${(room.price_per_semester || 0).toLocaleString('vi-VN')}`;

    if (!dormMap[dormCode]) {
      dormMap[dormCode] = {
        dormName: dorm.dorm_name,
        dormCode,
        roomTypes: {},
        dormTotal: { totalBeds: 0, usedBeds: 0, freeBeds: 0, maintenanceBeds: 0 },
      };
    }
    if (!dormMap[dormCode].roomTypes[rtLabel]) {
      dormMap[dormCode].roomTypes[rtLabel] = {
        roomType: rtLabel,
        totalBeds: 0,
        usedBeds: 0,
        freeBeds: 0,
        maintenanceBeds: 0,
      };
    }
    if (!roomTypeMap[rtLabel]) {
      roomTypeMap[rtLabel] = {
        roomType: rtLabel,
        totalBeds: 0,
        usedBeds: 0,
        freeBeds: 0,
        maintenanceBeds: 0,
      };
    }

    countBed(dormMap[dormCode].roomTypes[rtLabel], bed.status);
    countBed(dormMap[dormCode].dormTotal, bed.status);
    countBed(roomTypeMap[rtLabel], bed.status);
    countBed(grand, bed.status);
  });

  const byDormAndRoomType = Object.values(dormMap)
    .sort((a, b) => a.dormCode.localeCompare(b.dormCode))
    .map((d) => ({
      dormName: d.dormName,
      dormCode: d.dormCode,
      roomTypes: Object.values(d.roomTypes),
      dormTotal: d.dormTotal,
    }));

  return {
    grandTotal: grand,
    byDormAndRoomType,
    byRoomType: Object.values(roomTypeMap).sort((a, b) =>
      a.roomType.localeCompare(b.roomType)
    ),
  };
};

const getDashboardStats = async () => {
  const [
    totalDorms,
    totalBlocks,
    totalRooms,
    totalBeds,
    occupiedBeds,
    availableBeds,
    maintenanceBeds,
    rooms,
  ] = await Promise.all([
    Dorm.countDocuments(),
    Block.countDocuments(),
    Room.countDocuments(),
    Bed.countDocuments(),
    Bed.countDocuments({ status: 'occupied' }),
    Bed.countDocuments({ status: 'available' }),
    Bed.countDocuments({ status: 'maintenance' }),
    Room.find({}, { total_beds: 1, available_beds: 1, block: 1 })
      .populate({ path: 'block', select: 'block_name' })
      .lean(),
  ]);

  // Build bed usage per block from rooms data
  const blockMap = {};
  rooms.forEach((room) => {
    const blockName = room.block?.block_name || 'Unknown';
    if (!blockMap[blockName]) blockMap[blockName] = { total: 0, used: 0 };
    blockMap[blockName].total += room.total_beds || 0;
    blockMap[blockName].used += (room.total_beds || 0) - (room.available_beds || 0);
  });

  const bedUsageByBlock = Object.entries(blockMap)
    .map(([block, { total, used }]) => ({
      block,
      occupancyRate: total > 0 ? Math.round((used / total) * 100) : 0,
    }))
    .sort((a, b) => a.block.localeCompare(b.block));

  return {
    totalDorms,
    totalBlocks,
    totalRooms,
    totalBeds,
    occupiedBeds,
    availableBeds,
    maintenanceBeds,
    pendingRequests: 0,
    unpaidInvoices: 0,
    unpaidAmount: 0,
    bedUsageByBlock,
  };
};

module.exports = { getDashboardStats, getBedUsageStats };
