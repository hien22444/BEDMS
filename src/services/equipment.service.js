const EquipmentCategory = require('../models/equipmentCategory.model');
const EquipmentTemplate = require('../models/equipmentTemplate.model');
const RoomEquipment = require('../models/roomEquipment.model');
// const EquipmentHistory = require('../models/equipmentHistory.model'); // reserved for future audit trail
const RoomTypeEquipmentConfig = require('../models/roomTypeEquipmentConfig.model');

// ==================== CATEGORY ====================

const createCategory = async (body) => {
  const { category_name } = body;
  if (!category_name) {
    throw new Error('category_name is required');
  }

  const existing = await EquipmentCategory.findOne({
    category_name: category_name.trim(),
  });
  if (existing) {
    throw new Error('Category name already exists');
  }

  return EquipmentCategory.create({
    category_name: category_name.trim(),
    description: body.description,
  });
};

const getCategories = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filter.$or = [{ category_name: regex }, { description: regex }];
  }

  const [items, total] = await Promise.all([
    EquipmentCategory.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    EquipmentCategory.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
};

const getCategoryById = async (id) => {
  const category = await EquipmentCategory.findById(id);
  if (!category) throw new Error('Category not found');
  return category;
};

const updateCategory = async (id, body) => {
  if (body.category_name) {
    const existing = await EquipmentCategory.findOne({
      category_name: body.category_name.trim(),
      _id: { $ne: id },
    });
    if (existing) throw new Error('Category name already exists');
  }

  const category = await EquipmentCategory.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(body.category_name && { category_name: body.category_name }),
        ...(typeof body.description !== 'undefined' && { description: body.description }),
      },
    },
    { new: true }
  );
  if (!category) throw new Error('Category not found');
  return category;
};

const deleteCategory = async (id) => {
  const templateCount = await EquipmentTemplate.countDocuments({ category: id });
  if (templateCount > 0) {
    throw new Error(
      `Cannot delete category. ${templateCount} equipment template(s) still reference it.`
    );
  }

  const category = await EquipmentCategory.findByIdAndDelete(id);
  if (!category) throw new Error('Category not found');
  return { message: 'Category deleted successfully' };
};

// ==================== TEMPLATE ====================

const createTemplate = async (body) => {
  const { equipment_name, category } = body;
  if (!equipment_name || !category) {
    throw new Error('equipment_name and category are required');
  }

  const cat = await EquipmentCategory.findById(category);
  if (!cat) throw new Error('Category not found');

  return EquipmentTemplate.create({
    category,
    equipment_name: equipment_name.trim(),
    brand: body.brand,
    model: body.model,
    specifications: body.specifications,
    estimated_lifespan_years: body.estimated_lifespan_years,
    unit_price: body.unit_price,
    is_active: body.is_active,
  });
};

const getTemplates = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filter.$or = [{ equipment_name: regex }, { brand: regex }, { model: regex }];
  }
  if (query.category) {
    filter.category = query.category;
  }
  if (typeof query.is_active !== 'undefined') {
    filter.is_active = query.is_active === 'true';
  }

  const [items, total] = await Promise.all([
    EquipmentTemplate.find(filter)
      .populate('category', 'category_name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    EquipmentTemplate.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
};

const getTemplateById = async (id) => {
  const template = await EquipmentTemplate.findById(id).populate('category', 'category_name');
  if (!template) throw new Error('Template not found');
  return template;
};

const updateTemplate = async (id, body) => {
  if (body.category) {
    const cat = await EquipmentCategory.findById(body.category);
    if (!cat) throw new Error('Category not found');
  }

  const updateFields = {};
  if (body.equipment_name) updateFields.equipment_name = body.equipment_name;
  if (body.category) updateFields.category = body.category;
  if (body.brand !== undefined) updateFields.brand = body.brand;
  if (body.model !== undefined) updateFields.model = body.model;
  if (body.specifications !== undefined) updateFields.specifications = body.specifications;
  if (body.estimated_lifespan_years !== undefined)
    updateFields.estimated_lifespan_years = body.estimated_lifespan_years;
  if (body.unit_price !== undefined) updateFields.unit_price = body.unit_price;
  if (typeof body.is_active !== 'undefined') updateFields.is_active = body.is_active;

  const template = await EquipmentTemplate.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true }
  ).populate('category', 'category_name');

  if (!template) throw new Error('Template not found');
  return template;
};

const deleteTemplate = async (id) => {
  const [equipCount, configCount] = await Promise.all([
    RoomEquipment.countDocuments({ template: id }),
    RoomTypeEquipmentConfig.countDocuments({ template: id }),
  ]);

  if (equipCount > 0) {
    throw new Error(`Cannot delete template. ${equipCount} room equipment(s) still reference it.`);
  }
  if (configCount > 0) {
    throw new Error(
      `Cannot delete template. It is used in ${configCount} default room setup config(s). Remove those configs first.`
    );
  }

  const template = await EquipmentTemplate.findByIdAndDelete(id);
  if (!template) throw new Error('Template not found');
  return { message: 'Template deleted successfully' };
};

// ==================== ROOM TYPE EQUIPMENT CONFIG ====================

const createRoomTypeConfig = async (body) => {
  const { room_type, template, standard_quantity } = body;
  if (!room_type || !template || !standard_quantity) {
    throw new Error('room_type, template, and standard_quantity are required');
  }

  const tpl = await EquipmentTemplate.findById(template);
  if (!tpl) throw new Error('Template not found');

  const existing = await RoomTypeEquipmentConfig.findOne({ room_type, template });
  if (existing) {
    throw new Error('This template is already configured for this room type');
  }

  const config = await RoomTypeEquipmentConfig.create({
    room_type,
    template,
    standard_quantity,
    is_mandatory: body.is_mandatory !== undefined ? body.is_mandatory : true,
  });

  return config.populate('template', 'equipment_name brand model');
};

const getRoomTypeConfigs = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 50;
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.room_type) filter.room_type = query.room_type;

  const [items, total] = await Promise.all([
    RoomTypeEquipmentConfig.find(filter)
      .populate({
        path: 'template',
        select: 'equipment_name brand model category',
        populate: { path: 'category', select: 'category_name' },
      })
      .sort({ room_type: 1, created_at: -1 })
      .skip(skip)
      .limit(limit),
    RoomTypeEquipmentConfig.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
};

const updateRoomTypeConfig = async (id, body) => {
  const updateFields = {};
  if (body.standard_quantity !== undefined) updateFields.standard_quantity = body.standard_quantity;
  if (body.is_mandatory !== undefined) updateFields.is_mandatory = body.is_mandatory;

  if (body.template) {
    const tpl = await EquipmentTemplate.findById(body.template);
    if (!tpl) throw new Error('Template not found');
    updateFields.template = body.template;
  }

  if (body.room_type) {
    updateFields.room_type = body.room_type;
  }

  const config = await RoomTypeEquipmentConfig.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true }
  ).populate('template', 'equipment_name brand model');

  if (!config) throw new Error('Config not found');
  return config;
};

const deleteRoomTypeConfig = async (id) => {
  const config = await RoomTypeEquipmentConfig.findByIdAndDelete(id);
  if (!config) throw new Error('Config not found');
  return { message: 'Room type config deleted successfully' };
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  createRoomTypeConfig,
  getRoomTypeConfigs,
  updateRoomTypeConfig,
  deleteRoomTypeConfig,
};
