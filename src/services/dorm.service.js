const Dorm = require("../models/dorm.model");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create new dorm
 * @param {Object} body
 */
const createDorm = async (body) => {
  const { dorm_name, dorm_code } = body;

  if (!dorm_name || !dorm_code) {
    throw new Error("dorm_name and dorm_code are required");
  }

  const existing = await Dorm.findOne({ dorm_code: dorm_code.trim() });
  if (existing) {
    throw new Error("Dorm code already exists");
  }

  const dorm = await Dorm.create({
    dorm_name: dorm_name.trim(),
    dorm_code: dorm_code.trim(),
    total_blocks: body.total_blocks,
    description: body.description,
    is_active: body.is_active,
  });

  return dorm;
};

/**
 * Get list of dorms with simple pagination & search
 * @param {Object} query
 */
const getDorms = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ dorm_name: regex }, { dorm_code: regex }];
  }

  if (typeof query.is_active !== "undefined") {
    filter.is_active = query.is_active === "true";
  }

  const [items, total] = await Promise.all([
    Dorm.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Dorm.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Get dorm detail by id
 * @param {string} id
 */
const getDormById = async (id) => {
  const dorm = await Dorm.findById(id);
  if (!dorm) {
    throw new Error("Dorm not found");
  }
  return dorm;
};

/**
 * Update dorm
 * @param {string} id
 * @param {Object} body
 */
const updateDorm = async (id, body) => {
  if (body.dorm_code) {
    const existing = await Dorm.findOne({
      dorm_code: body.dorm_code.trim(),
      _id: { $ne: id },
    });
    if (existing) {
      throw new Error("Dorm code already exists");
    }
  }

  const dorm = await Dorm.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(body.dorm_name && { dorm_name: body.dorm_name }),
        ...(body.dorm_code && { dorm_code: body.dorm_code }),
        ...(typeof body.total_blocks !== "undefined" && {
          total_blocks: body.total_blocks,
        }),
        ...(typeof body.description !== "undefined" && {
          description: body.description,
        }),
        ...(typeof body.is_active !== "undefined" && {
          is_active: body.is_active,
        }),
      },
    },
    { new: true }
  );

  if (!dorm) {
    throw new Error("Dorm not found");
  }

  return dorm;
};

/**
 * Delete dorm (hard delete)
 * @param {string} id
 */
const deleteDorm = async (id) => {
  const dorm = await Dorm.findByIdAndDelete(id);
  if (!dorm) {
    throw new Error("Dorm not found");
  }
  return { message: "Dorm deleted successfully" };
};

module.exports = {
  createDorm,
  getDorms,
  getDormById,
  updateDorm,
  deleteDorm,
};

