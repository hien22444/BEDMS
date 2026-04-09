const { getDashboardStats, getBedUsageStats } = require('../services/stats.service');

const getDashboard = async (req, res, next) => {
  try {
    const data = await getDashboardStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getBedUsage = async (req, res, next) => {
  try {
    const data = await getBedUsageStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard, getBedUsage };
