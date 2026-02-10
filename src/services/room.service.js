const { Room, Block } = require("../models");

const populateBlockDorm = {
  path: "block",
  select: "block_name block_code dorm",
  populate: {
    path: "dorm",
    select: "dorm_name dorm_code",
  },
};

const getAllRooms = async (query = {}) => {
  const { page = 1, limit = 50, dorm, block, status, room_type } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};

  if (status) {
    filter.status = status;
  }
  if (room_type) {
    filter.room_type = room_type;
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

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate(populateBlockDorm)
      .sort({ createdAt: -1 })
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

  const room = await new Room(body).save();

  await Block.findByIdAndUpdate(body.block, { $inc: { total_rooms: 1 } });

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

    const existingRoom = await Room.findOne({
      block: body.block,
      room_number: nextRoomNumber,
      _id: { $ne: id },
    });
    if (existingRoom) {
      throw new Error("Room number already exists for this block");
    }

    await Promise.all([
      Block.findByIdAndUpdate(room.block, { $inc: { total_rooms: -1 } }),
      Block.findByIdAndUpdate(body.block, { $inc: { total_rooms: 1 } }),
    ]);
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

  Object.assign(room, body);
  await room.save();

  return await Room.findById(id).populate(populateBlockDorm);
};

const deleteRoom = async (id) => {
  const room = await Room.findById(id);

  if (!room) {
    throw new Error("Room not found");
  }

  await room.deleteOne();

  await Block.findByIdAndUpdate(room.block, { $inc: { total_rooms: -1 } });

  return { message: "Room deleted successfully" };
};

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};

