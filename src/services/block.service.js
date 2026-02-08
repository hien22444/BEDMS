const { Block, Dorm } = require("../models");

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
      .populate("dorm", "dorm_name dorm_code")
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
  const block = await Block.findById(id).populate("dorm", "dorm_name dorm_code");

  if (!block) {
    throw new Error("Block not found");
  }

  return block;
};

const createBlock = async (body) => {
  // Validate dorm exists
  const dorm = await Dorm.findById(body.dorm);
  if (!dorm) {
    throw new Error("Dorm not found");
  }

  // Check if block_code already exists for this dorm
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

  return await Block.findById(block._id).populate("dorm", "dorm_name dorm_code");
};

const updateBlock = async (id, body) => {
  const block = await Block.findById(id);

  if (!block) {
    throw new Error("Block not found");
  }

  // If dorm is being changed, validate new dorm exists
  if (body.dorm && body.dorm !== block.dorm.toString()) {
    const dorm = await Dorm.findById(body.dorm);
    if (!dorm) {
      throw new Error("Dorm not found");
    }

    // Check if block_code already exists in new dorm
    const existingBlock = await Block.findOne({
      dorm: body.dorm,
      block_code: body.block_code || block.block_code,
      _id: { $ne: id },
    });

    if (existingBlock) {
      throw new Error("Block code already exists for this dorm");
    }

    // Update old and new dorm total_blocks
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

  Object.assign(block, body);
  await block.save();

  return await Block.findById(id).populate("dorm", "dorm_name dorm_code");
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
