const { SystemConfig, Staff } = require('../models');

const KEYS = {
  HOLD_START: 'booking_hold_window_start',
  HOLD_END: 'booking_hold_window_end',
  NEW_START: 'booking_new_window_start',
  NEW_END: 'booking_new_window_end',
};

const getDateConfig = async () => {
  const configs = await SystemConfig.find({
    config_key: { $in: Object.values(KEYS) },
  }).lean();

  const map = {};
  configs.forEach((c) => {
    map[c.config_key] = c.config_value;
  });

  return {
    hold_window: {
      start: map[KEYS.HOLD_START] || null,
      end: map[KEYS.HOLD_END] || null,
    },
    new_booking_window: {
      start: map[KEYS.NEW_START] || null,
      end: map[KEYS.NEW_END] || null,
    },
  };
};

const updateDateConfig = async (userId, { hold_window, new_booking_window }) => {
  const staff = await Staff.findOne({ user: userId });
  const staffId = staff?._id || null;

  const entries = [
    { key: KEYS.HOLD_START, value: hold_window?.start || '', desc: 'Bed hold window start date (for students with existing booking)' },
    { key: KEYS.HOLD_END, value: hold_window?.end || '', desc: 'Bed hold window end date (for students with existing booking)' },
    { key: KEYS.NEW_START, value: new_booking_window?.start || '', desc: 'New booking window start date (for students without a booking)' },
    { key: KEYS.NEW_END, value: new_booking_window?.end || '', desc: 'New booking window end date (for students without a booking)' },
  ];

  for (const { key, value, desc } of entries) {
    await SystemConfig.findOneAndUpdate(
      { config_key: key },
      {
        config_value: value,
        value_type: 'string',
        description: desc,
        updated_by: staffId,
        updated_at: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  return getDateConfig();
};

module.exports = {
  getDateConfig,
  updateDateConfig,
  KEYS,
};
