const { Room, Block } = require("../models");
const AppError = require("../utils/AppError");

const populateBlockDorm = {
  path: "block",
  select: "block_name block_code dorm",
  populate: {
    path: "dorm",
    select: "dorm_name dorm_code",
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
    const blocks = await Block.find({ dorm }).select("_id");
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
      const regex = new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      // If user types something like "A101-2", split and search block + room separately
      if (raw.includes("-")) {
        const [blockPart, roomPart] = raw.split("-", 2).map((p) => p.trim());
        const roomRegex = roomPart ? new RegExp(roomPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

        const blocksByName = await Block.find({
          $or: [{ block_name: new RegExp(blockPart, "i") }, { block_code: new RegExp(blockPart, "i") }],
        }).select("_id");

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
        }).select("_id");
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
    throw new Error("Room not found");
  }

  return room;
};

const createRoom = async (body) => {
  const blk = await Block.findById(body.block);
  if (!blk) {
    throw new Error("Block not found");
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
    throw new Error("Room number already exists for this block");
  }

  const totalBeds = Number(body.total_beds);
  const availableBeds = Number(body.available_beds);
  if (Number.isFinite(totalBeds) && Number.isFinite(availableBeds)) {
    if (availableBeds > totalBeds) {
      throw new Error("available_beds cannot be greater than total_beds");
    }
  }

  const payload = { ...body, floor: blk.floor };
  const room = await new Room(payload).save();

  return await Room.findById(room._id).populate(populateBlockDorm);
};

const updateRoom = async (id, body) => {
  const room = await Room.findById(id);

  if (!room) {
    throw new Error("Room not found");
  }

  const nextBlock = body.block ? String(body.block) : String(room.block);
  const nextRoomNumber = body.room_number ? String(body.room_number) : String(room.room_number);

  // Handle block change
  if (body.block && String(body.block) !== String(room.block)) {
    const blk = await Block.findById(body.block);
    if (!blk) {
      throw new Error("Block not found");
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
      throw new Error("Room number already exists for this block");
    }
  } else if (body.room_number && body.room_number !== room.room_number) {
    const existingRoom = await Room.findOne({
      block: nextBlock,
      room_number: body.room_number,
      _id: { $ne: id },
    });
    if (existingRoom) {
      throw new Error("Room number already exists for this block");
    }
  }

  const nextTotalBeds =
    typeof body.total_beds !== "undefined" ? Number(body.total_beds) : Number(room.total_beds);
  const nextAvailableBeds =
    typeof body.available_beds !== "undefined"
      ? Number(body.available_beds)
      : Number(room.available_beds);
  if (Number.isFinite(nextTotalBeds) && Number.isFinite(nextAvailableBeds)) {
    if (nextAvailableBeds > nextTotalBeds) {
      throw new Error("available_beds cannot be greater than total_beds");
    }
  }

  const targetBlockId = body.block || room.block;
  const targetBlock = await Block.findById(targetBlockId);
  if (targetBlock) {
    body.floor = targetBlock.floor;
  }

  Object.assign(room, body);
  await room.save();

  return await Room.findById(id).populate(populateBlockDorm);
};

const deleteRoom = async (id) => {
  const room = await Room.findById(id);

  if (!room) {
    throw new Error("Room not found");
  }

  const blockId = room.block;

  await room.deleteOne();

  // After deletion, re-sequence room numbers in this block: 1,2,3,...
  const roomsInBlock = await Room.find({ block: blockId }).sort({ room_number: 1 });

  let nextNumber = 1;
  for (const r of roomsInBlock) {
    const current = String(r.room_number);
    const target = String(nextNumber);
    if (current !== target) {
      r.room_number = target;
      await r.save();
    }
    nextNumber += 1;
  }

  return { message: "Room deleted successfully" };
};

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};

