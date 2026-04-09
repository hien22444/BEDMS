const { status } = require('http-status');
const { dateConfigService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getDateConfig = catchAsync(async (req, res) => {
  const data = await dateConfigService.getDateConfig();
  res.success(data, status.OK);
});

const updateDateConfig = catchAsync(async (req, res) => {
  const data = await dateConfigService.updateDateConfig(req.user.id, req.body);

  // Broadcast to all connected clients so the student booking page
  // can refresh the window status without a manual reload.
  const io = req.app.get('io');
  if (io) {
    io.emit('booking_config_updated', data);
  }

  res.success(data, status.OK);
});

module.exports = { getDateConfig, updateDateConfig };
