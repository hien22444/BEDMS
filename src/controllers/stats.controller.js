const { getDashboardStats } = require('../services/stats.service');

const getDashboard = async (req, res, next) => {
  try {
    const data = await getDashboardStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard };
