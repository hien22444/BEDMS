const Bed = require('../models/bed.model');
const { Room, Block } = require('../models');
const Contract = require('../models/contract.model');
const AppError = require('../utils/AppError');

const populateRoom = {
  path: 'room',
  select: 'room_number block available_beds total_beds status student_type',
  populate: {
    path: 'block',
    select: 'block_name block_code gender_type dorm',
    populate: { path: 'dorm', select: 'dorm_name dorm_code' },
  },
};

const populateStudent = {
  path: 'student',
  select: 'full_name student_code phone gender',
  populate: { path: 'user', select: 'email' },
};

// Gắn thông tin contract đang active vào mỗi bed
const attachContracts = async (beds) => {
  const bedIds = beds.map((b) => b._id);
  const contracts = await Contract.find({
    bed: { $in: bedIds },
    status: { $in: ['active', 'extended'] },
  }).populate(populateStudent);

  const contractByBed = {};
  contracts.forEach((c) => {
    contractByBed[String(c.bed)] = c;
  });

  return beds.map((bed) => ({
    ...bed.toJSON(),
    contract: contractByBed[String(bed._id)] || null,
  }));
};

// ==================== GET ALL BEDS ====================

const getAllBeds = async (query = {}) => {
  const { page = 1, limit = 50, room, block, dorm, status } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (status) filter.status = status;

  if (room) {
    filter.room = room;
  } else if (block) {
    const rooms = await Room.find({ block }).select('_id');
    filter.room = { $in: rooms.map((r) => r._id) };
  } else if (dorm) {
    const blocks = await Block.find({ dorm }).select('_id');
    const rooms = await Room.find({ block: { $in: blocks.map((b) => b._id) } }).select('_id');
    filter.room = { $in: rooms.map((r) => r._id) };
  }

  const [beds, total] = await Promise.all([
    Bed.find(filter).populate(populateRoom).sort({ bed_id: 1 }).skip(skip).limit(parseInt(limit)),
    Bed.countDocuments(filter),
  ]);

  const items = await attachContracts(beds);

  return {
    items,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)) || 1,
    },
  };
};

// ==================== GET BY ROOM ====================

const getBedsByRoom = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) throw new AppError('Room not found', 404);

  const beds = await Bed.find({ room: roomId }).populate(populateRoom).sort({ bed_id: 1 });

  return attachContracts(beds);
};

// ==================== GET BED BY ID ====================

const getBedById = async (id) => {
  const bed = await Bed.findById(id).populate(populateRoom);
  if (!bed) throw new AppError('Bed not found', 404);

  const contract = await Contract.findOne({
    bed: id,
    status: { $in: ['active', 'extended'] },
  }).populate(populateStudent);

  return { ...bed.toJSON(), contract: contract || null };
};

// ==================== UPDATE BED STATUS ====================

const updateBedStatus = async (id, status) => {
  const allowed = ['available', 'maintenance', 'reserved'];
  if (!allowed.includes(status)) {
    throw new AppError(`Status must be one of: ${allowed.join(', ')}`, 400);
  }

  const bed = await Bed.findById(id);
  if (!bed) throw new AppError('Bed not found', 404);

  if (bed.status === 'occupied') {
    const activeContract = await Contract.findOne({
      bed: id,
      status: { $in: ['active', 'extended'] },
    });
    if (activeContract) {
      throw new AppError(
        'Cannot change status of an occupied bed. Unassign the student first.',
        400
      );
    }
  }

  const oldStatus = bed.status;
  bed.status = status;
  await bed.save();

  // Sync room.available_beds
  if (oldStatus !== status) {
    await syncRoomAvailability(bed.room);
  }

  return bed.populate(populateRoom);
};

// ==================== CHANGE BED ASSIGNMENT ====================

const changeBedAssignment = async (sourceBedId, targetBedId) => {
  if (String(sourceBedId) === String(targetBedId)) {
    throw new AppError('Source and target bed must be different', 400);
  }

  const [sourceBed, targetBed] = await Promise.all([
    Bed.findById(sourceBedId),
    Bed.findById(targetBedId),
  ]);

  if (!sourceBed) throw new AppError('Source bed not found', 404);
  if (!targetBed) throw new AppError('Target bed not found', 404);
  if (sourceBed.status !== 'occupied') throw new AppError('Source bed has no occupant', 400);
  if (targetBed.status !== 'available') throw new AppError('Target bed is not available', 400);

  const contract = await Contract.findOne({
    bed: sourceBedId,
    status: { $in: ['active', 'extended'] },
  });
  if (!contract) throw new AppError('No active contract found for source bed', 404);

  // Move contract to target bed (and room if different)
  contract.bed = targetBed._id;
  contract.room = targetBed.room;
  await contract.save();

  // Update bed statuses
  sourceBed.status = 'available';
  targetBed.status = 'occupied';
  await Promise.all([sourceBed.save(), targetBed.save()]);

  // Sync available_beds for affected rooms
  const roomIds = [...new Set([String(sourceBed.room), String(targetBed.room)])];
  await Promise.all(roomIds.map(syncRoomAvailability));

  return { message: 'Bed assignment changed successfully' };
};

// ==================== HELPER ====================

const syncRoomAvailability = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) return;

  const availableCount = await Bed.countDocuments({ room: roomId, status: 'available' });
  room.available_beds = availableCount;

  const occupiedCount = await Bed.countDocuments({ room: roomId, status: 'occupied' });
  if (occupiedCount === room.total_beds) room.status = 'full';
  else if (room.status === 'full') room.status = 'available';

  await room.save();
};

module.exports = {
  getAllBeds,
  getBedsByRoom,
  getBedById,
  updateBedStatus,
  changeBedAssignment,
};
