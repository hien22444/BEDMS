const { Block, Dorm, Room } = require("../models");

const getAllBlocks = async (query = {}) => {
  const { page = 1, limit = 50, dorm, is_active } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (dorm) {
    filter.dorm = dorm;
  }
  if (is_active !== undefined) {
    filter.is_active = is_active === "true" || is_active === true;
  }

  const [blocks, total] = await Promise.all([
    Block.find(filter)
      .populate("dorm", "dorm_name dorm_code total_floors")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Block.countDocuments(filter),
  ]);

  return {
    items: blocks,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

const getBlockById = async (id) => {
  const block = await Block.findById(id).populate("dorm", "dorm_name dorm_code total_floors");

  if (!block) {
    throw new Error("Block not found");
  }

  return block;
};

const createBlock = async (body) => {
  const dorm = await Dorm.findById(body.dorm);
  if (!dorm) {
    throw new Error("Dorm not found");
  }

  const floor = Number(body.floor);
  if (!Number.isFinite(floor) || floor < 1) {
    throw new Error("floor is required and must be at least 1");
  }
  if (floor > (dorm.total_floors || 0)) {
    throw new Error(
      `floor must be between 1 and dorm's total_floors (${dorm.total_floors}). This dorm has ${dorm.total_floors} floor(s).`
    );
  }

  const existingBlock = await Block.findOne({
    dorm: body.dorm,
    block_code: body.block_code,
  });

  if (existingBlock) {
    throw new Error("Block code already exists for this dorm");
  }

  const block = await new Block(body).save();

  // Update dorm total_blocks count
  await Dorm.findByIdAndUpdate(body.dorm, {
    $inc: { total_blocks: 1 },
  });

  return await Block.findById(block._id).populate("dorm", "dorm_name dorm_code total_floors");
};

const validateBlockFloor = (floor, dorm) => {
  const f = Number(floor);
  if (!Number.isFinite(f) || f < 1) {
    throw new Error("floor is required and must be at least 1");
  }
  const totalFloors = dorm.total_floors || 0;
  if (f > totalFloors) {
    throw new Error(
      `floor must be between 1 and dorm's total_floors (${totalFloors}). This dorm has ${totalFloors} floor(s).`
    );
  }
};

const updateBlock = async (id, body) => {
  const block = await Block.findById(id);

  if (!block) {
    throw new Error("Block not found");
  }

  const targetDormId = body.dorm ? body.dorm : block.dorm;
  const dorm = await Dorm.findById(targetDormId);
  if (!dorm) {
    throw new Error("Dorm not found");
  }

  const nextFloor = typeof body.floor !== "undefined" ? body.floor : block.floor;
  validateBlockFloor(nextFloor, dorm);

  if (body.dorm && body.dorm !== block.dorm.toString()) {
    const existingBlock = await Block.findOne({
      dorm: body.dorm,
      block_code: body.block_code || block.block_code,
      _id: { $ne: id },
    });

    if (existingBlock) {
      throw new Error("Block code already exists for this dorm");
    }

    await Promise.all([
      Dorm.findByIdAndUpdate(block.dorm, { $inc: { total_blocks: -1 } }),
      Dorm.findByIdAndUpdate(body.dorm, { $inc: { total_blocks: 1 } }),
    ]);
  } else if (body.block_code && body.block_code !== block.block_code) {
    // If only block_code is being changed, check uniqueness
    const existingBlock = await Block.findOne({
      dorm: block.dorm,
      block_code: body.block_code,
      _id: { $ne: id },
    });

    if (existingBlock) {
      throw new Error("Block code already exists for this dorm");
    }
  }

  if (typeof body.total_rooms === "number" && body.total_rooms >= 0) {
    const currentRoomCount = await Room.countDocuments({ block: id });
    if (body.total_rooms < currentRoomCount) {
      throw new Error(
        `Block currently has ${currentRoomCount} room(s). total_rooms cannot be set to ${body.total_rooms}. Remove rooms first or set a value >= ${currentRoomCount}.`
      );
    }
  }

  Object.assign(block, body);
  await block.save();

  return await Block.findById(id).populate("dorm", "dorm_name dorm_code total_floors");
};

const deleteBlock = async (id) => {
  const block = await Block.findById(id);

  if (!block) {
    throw new Error("Block not found");
  }

  await block.deleteOne();

  // Update dorm total_blocks count
  await Dorm.findByIdAndUpdate(block.dorm, {
    $inc: { total_blocks: -1 },
  });

  return { message: "Block deleted successfully" };
};

module.exports = {
  getAllBlocks,
  getBlockById,
  createBlock,
  updateBlock,
  deleteBlock,
};
