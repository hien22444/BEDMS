const crypto = require('crypto');
const { Room, Block } = require('../models');
const AppError = require('../utils/AppError');
const RoomTypeEquipmentConfig = require('../models/roomTypeEquipmentConfig.model');
const RoomEquipment = require('../models/roomEquipment.model');
const Bed = require('../models/bed.model');

const populateBlockDorm = {
  path: 'block',
  select: 'block_name block_code dorm',
  populate: {
    path: 'dorm',
    select: 'dorm_name dorm_code',
  },
};

const getAllRooms = async (query = {}) => {
  const { page = 1, limit = 50, dorm, block, status, room_type, student_type, search } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};

  if (status) {
    filter.status = status;
  }
  if (room_type) {
    filter.room_type = room_type;
  }
  if (student_type) {
    filter.student_type = student_type;
  }

  // Filter by dorm via blocks
  if (dorm && !block) {
    const blocks = await Block.find({ dorm }).select('_id');
    filter.block = { $in: blocks.map((b) => b._id) };
  }

  // Filter by block (takes precedence)
  if (block) {
    filter.block = block;
  }

  // Search by room number or block name/code
  if (search) {
    const raw = String(search).trim();
    if (raw) {
      const regex = new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      // If user types something like "A101-2", split and search block + room separately
      if (raw.includes('-')) {
        const [blockPart, roomPart] = raw.split('-', 2).map((p) => p.trim());
        const roomRegex = roomPart
          ? new RegExp(roomPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
          : null;

        const blocksByName = await Block.find({
          $or: [
            { block_name: new RegExp(blockPart, 'i') },
            { block_code: new RegExp(blockPart, 'i') },
          ],
        }).select('_id');

        const blockIds = blocksByName.map((b) => b._id);

        filter.$and = [];
        if (blockIds.length > 0) {
          filter.$and.push({ block: { $in: blockIds } });
        }
        if (roomRegex) {
          filter.$and.push({ room_number: roomRegex });
        }
      } else {
        // Generic search on room_number or matching blocks
        const blocksBySearch = await Block.find({
          $or: [{ block_name: regex }, { block_code: regex }],
        }).select('_id');
        const blockIds = blocksBySearch.map((b) => b._id);

        filter.$or = [{ room_number: regex }];
        if (blockIds.length > 0) {
          filter.$or.push({ block: { $in: blockIds } });
        }
      }
    }
  }

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate(populateBlockDorm)
      // Sort by block then room number for stable ordering
      .sort({ block: 1, room_number: 1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Room.countDocuments(filter),
  ]);

  return {
    items: rooms,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

const getRoomById = async (id) => {
  const room = await Room.findById(id).populate(populateBlockDorm);

  if (!room) {
    throw new Error('Room not found');
  }

  return room;
};

/**
 * Create new room
 * @param {Object} body
 * @param {import('socket.io').Server} io
 */
const createRoom = async (body, io) => {
  const blk = await Block.findById(body.block);
  if (!blk) {
    throw new Error('Block not found');
  }

  const maxRooms = Number(blk.total_rooms);
  if (Number.isFinite(maxRooms) && maxRooms > 0) {
    const currentCount = await Room.countDocuments({ block: body.block });
    if (currentCount >= maxRooms) {
      throw new AppError(
        `Block only allows ${maxRooms} room(s). Cannot create more rooms in this block.`,
        400
      );
    }
  }

  const existingRoom = await Room.findOne({
    block: body.block,
    room_number: body.room_number,
  });
  if (existingRoom) {
    throw new Error('Room number already exists for this block');
  }

  const totalBeds = Number(body.total_beds);
  const availableBeds = Number(body.available_beds);
  if (Number.isFinite(totalBeds) && Number.isFinite(availableBeds)) {
    if (availableBeds > totalBeds) {
      throw new Error('available_beds cannot be greater than total_beds');
    }
  }

  const payload = { ...body, floor: blk.floor };
  const room = await new Room(payload).save();

  // Auto-assign default equipment based on RoomTypeEquipmentConfig
  if (room.room_type) {
    const configs = await RoomTypeEquipmentConfig.find({
      room_type: room.room_type,
      is_mandatory: true,
    });
    if (configs.length > 0) {
      const equipmentDocs = configs.map((cfg) => ({
        room: room._id,
        template: cfg.template,
        equipment_code: `${room.room_number.toUpperCase()}-${cfg.template.toString().slice(-4).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        quantity: cfg.standard_quantity,
        status: 'good',
        assigned_at: new Date(),
      }));
      await RoomEquipment.insertMany(equipmentDocs, { ordered: false });
    }
  }

  // Auto-create Bed documents: beds 1..available_beds → available, rest → maintenance
  if (totalBeds > 0) {
    const maxBedDoc = await Bed.findOne({}, { bed_id: 1 }).sort({ bed_id: -1 });
    const startId = (maxBedDoc?.bed_id || 0) + 1;
    const bedDocs = Array.from({ length: totalBeds }, (_, i) => ({
      room: room._id,
      bed_number: String(i + 1),
      status: i < availableBeds ? 'available' : 'maintenance',
      bed_id: startId + i,
    }));
    await Bed.insertMany(bedDocs, { ordered: false });
  }

  const created = await Room.findById(room._id).populate(populateBlockDorm);

  if (io) {
    io.emit('room_updated', { action: 'create', data: created });
  }

  return created;
};

/**
 * Update room
 * @param {string} id
 * @param {Object} body
 * @param {import('socket.io').Server} io
 */
const updateRoom = async (id, body, io) => {
  const room = await Room.findById(id);

  if (!room) {
    throw new Error('Room not found');
  }

  const nextBlock = body.block ? String(body.block) : String(room.block);
  const nextRoomNumber = body.room_number ? String(body.room_number) : String(room.room_number);

  // Handle block change
  if (body.block && String(body.block) !== String(room.block)) {
    const blk = await Block.findById(body.block);
    if (!blk) {
      throw new Error('Block not found');
    }

    const maxRooms = Number(blk.total_rooms);
    if (Number.isFinite(maxRooms) && maxRooms > 0) {
      const countInNewBlock = await Room.countDocuments({ block: body.block });
      if (countInNewBlock >= maxRooms) {
        throw new AppError(
          `Target block only allows ${maxRooms} room(s). Cannot move this room there.`,
          400
        );
      }
    }

    const existingRoom = await Room.findOne({
      block: body.block,
      room_number: nextRoomNumber,
      _id: { $ne: id },
    });
    if (existingRoom) {
      throw new Error('Room number already exists for this block');
    }
  } else if (body.room_number && body.room_number !== room.room_number) {
    const existingRoom = await Room.findOne({
      block: nextBlock,
      room_number: body.room_number,
      _id: { $ne: id },
    });
    if (existingRoom) {
      throw new Error('Room number already exists for this block');
    }
  }

  const nextTotalBeds =
    typeof body.total_beds !== 'undefined' ? Number(body.total_beds) : Number(room.total_beds);
  const nextAvailableBeds =
    typeof body.available_beds !== 'undefined'
      ? Number(body.available_beds)
      : Number(room.available_beds);
  if (Number.isFinite(nextTotalBeds) && Number.isFinite(nextAvailableBeds)) {
    if (nextAvailableBeds > nextTotalBeds) {
      throw new Error('available_beds cannot be greater than total_beds');
    }
  }

  const targetBlockId = body.block || room.block;
  const targetBlock = await Block.findById(targetBlockId);
  if (targetBlock) {
    body.floor = targetBlock.floor;
  }

  const oldTotalBeds = Number(room.total_beds);
  Object.assign(room, body);
  await room.save();

  // Sync Bed documents when total_beds changes
  const newTotalBeds = Number(room.total_beds);
  if (newTotalBeds !== oldTotalBeds) {
    // Sort by bed_id (numeric) to get correct 1,2,3,...,10 order, not string "1","10","2",...
    const existingBeds = await Bed.find({ room: id }).sort({ bed_id: 1 });
    const currentCount = existingBeds.length;

    if (newTotalBeds > currentCount) {
      // Add new beds (numbered from currentCount+1 to newTotalBeds), status maintenance
      const maxBedDoc = await Bed.findOne({}, { bed_id: 1 }).sort({ bed_id: -1 });
      const startId = (maxBedDoc?.bed_id || 0) + 1;
      const newBedDocs = Array.from({ length: newTotalBeds - currentCount }, (_, i) => ({
        room: id,
        bed_number: String(currentCount + i + 1),
        status: 'maintenance',
        bed_id: startId + i,
      }));
      await Bed.insertMany(newBedDocs, { ordered: false });
    } else if (newTotalBeds < currentCount) {
      // Remove excess beds from the end (highest bed_number first) if not occupied/reserved
      const toRemove = existingBeds.slice(newTotalBeds);
      const occupiedIds = toRemove
        .filter((b) => b.status === 'occupied' || b.status === 'reserved')
        .map((b) => b._id);
      if (occupiedIds.length > 0) {
        throw new AppError('Cannot reduce total_beds: some beds are occupied or reserved', 400);
      }
      await Bed.deleteMany({ _id: { $in: toRemove.map((b) => b._id) } });
    }

    // Re-apply available/maintenance statuses: first n beds → available, rest → maintenance
    const newAvailableBeds = Number(room.available_beds);
    const allBeds = await Bed.find({ room: id }).sort({ bed_id: 1 });
    const bulkOps = allBeds
      .filter((b) => b.status !== 'occupied' && b.status !== 'reserved')
      .map((bed, idx) => ({
        updateOne: {
          filter: { _id: bed._id },
          update: { $set: { status: idx < newAvailableBeds ? 'available' : 'maintenance' } },
        },
      }));
    if (bulkOps.length > 0) {
      await Bed.bulkWrite(bulkOps);
    }
  }

  const updated = await Room.findById(id).populate(populateBlockDorm);

  if (io) {
    io.emit('room_updated', { action: 'update', data: updated });
  }

  return updated;
};

/**
 * Delete room
 * @param {string} id
 * @param {import('socket.io').Server} io
 */
const deleteRoom = async (id, io) => {
  const room = await Room.findById(id);

  if (!room) {
    throw new Error('Room not found');
  }

  // Block deletion if any bed is occupied or reserved
  const blockedCount = await Bed.countDocuments({
    room: id,
    status: { $in: ['occupied', 'reserved'] },
  });
  if (blockedCount > 0) {
    throw new AppError(
      `Cannot delete room: ${blockedCount} bed(s) are currently occupied or reserved. Unassign all students first.`,
      400
    );
  }

  await Bed.deleteMany({ room: id });
  await RoomEquipment.deleteMany({ room: id });
  await room.deleteOne();

  if (io) {
    io.emit('room_updated', { action: 'delete', id });
  }
  return { message: 'Room deleted successfully' };
};

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};
