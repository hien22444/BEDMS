const { SystemConfig, Room } = require('../models');
const AppError = require('../utils/AppError');

const CONFIG_KEY = 'room_type_pricing';

const DEFAULT_PRICING = {};

const getRoomTypePricing = async () => {
  let config = await SystemConfig.findOne({ config_key: CONFIG_KEY });

  if (!config) {
    // Start with empty room type pricing; admin will define types manually via API
    config = await SystemConfig.create({
      config_key: CONFIG_KEY,
      config_value: JSON.stringify(DEFAULT_PRICING),
      description: 'Room type pricing (per semester)',
      value_type: 'json',
    });
  }

  let prices;
  try {
    prices = JSON.parse(config.config_value || '{}');
  } catch {
    prices = DEFAULT_PRICING;
  }

  return { prices };
};

const updateRoomTypePricing = async (body) => {
  const { prices } = body || {};
  if (!prices || typeof prices !== 'object') {
    throw new AppError('prices must be an object of { room_type: number }', 400);
  }

  // Load existing config so we can detect which room types are being deleted
  const existingConfig = await SystemConfig.findOne({ config_key: CONFIG_KEY });
  let previousPrices = {};
  if (existingConfig && existingConfig.config_value) {
    try {
      previousPrices = JSON.parse(existingConfig.config_value || '{}');
    } catch {
      previousPrices = {};
    }
  }

  const cleaned = {};

  Object.entries(prices).forEach(([key, value]) => {
    const roomType = String(key);

    // Expect format like "2_person", "3_person", etc.
    const match = /^(\d+)_person$/i.exec(roomType);
    if (!match) {
      throw new AppError(
        `Invalid room type key: "${roomType}". Expected format "<beds>_person", e.g. "2_person" or "3_person".`,
        400
      );
    }

    const beds = parseInt(match[1], 10);
    if (!Number.isFinite(beds) || beds <= 1) {
      throw new AppError('Room type must have number of beds greater than 1', 400);
    }

    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) {
      throw new AppError(
        `Invalid price for room type "${roomType}". Price must be a non-negative number.`,
        400
      );
    }

    cleaned[roomType] = price;
  });

  // Determine which room types are being removed and ensure they are not linked to any Room
  const deletedRoomTypes = Object.keys(previousPrices).filter((key) => !(key in cleaned));

  for (const roomType of deletedRoomTypes) {
    const inUse = await Room.exists({ room_type: roomType });
    if (inUse) {
      throw new AppError(
        `Cannot delete room type "${roomType}" because it is currently linked to existing rooms.`,
        400
      );
    }
  }

  const json = JSON.stringify(cleaned);

  await SystemConfig.findOneAndUpdate(
    { config_key: CONFIG_KEY },
    {
      config_key: CONFIG_KEY,
      config_value: json,
      description: 'Room type pricing (per semester)',
      value_type: 'json',
      updated_at: new Date(),
    },
    { upsert: true, new: true }
  );

  // Also update existing Room documents so their price_per_semester
  // always matches the latest pricing for their room_type
  await Promise.all(
    Object.entries(cleaned).map(([roomType, price]) =>
      Room.updateMany({ room_type: roomType }, { price_per_semester: price })
    )
  );

  return { prices: cleaned };
};

module.exports = {
  getRoomTypePricing,
  updateRoomTypePricing,
};
