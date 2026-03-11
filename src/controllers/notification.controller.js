const { status } = require('http-status');
const { notificationService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getMyNotifications = catchAsync(async (req, res) => {
  const data = await notificationService.getMyNotifications(req.user.id);
  res.success(data, status.OK);
});

const markAsRead = catchAsync(async (req, res) => {
  const data = await notificationService.markAsRead(req.params.id, req.user.id);
  res.success(data, status.OK);
});

const markAllRead = catchAsync(async (req, res) => {
  await notificationService.markAllRead(req.user.id);
  res.success({ message: 'All notifications marked as read' }, status.OK);
});

const deleteNotification = catchAsync(async (req, res) => {
  await notificationService.deleteNotification(req.params.id, req.user.id);
  res.success({ message: 'Notification deleted' }, status.OK);
});

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
};
