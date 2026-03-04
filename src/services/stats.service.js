const { Dorm, Block, Room } = require('../models');
const Bed = require('../models/bed.model');

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

module.exports = { getDashboardStats };
