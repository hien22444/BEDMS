const { Notification } = require("../models");

/**
 * Create a notification for a user
 */
const createNotification = async (userId, { title, message, category, notification_type = "info", related_id }) => {
  return Notification.create({
    user: userId,
    title,
    message,
    notification_type,
    category,
    related_id: related_id || undefined,
  });
};

/**
 * Get all notifications for the authenticated user (latest 50)
 */
const getMyNotifications = async (userId) => {
  return Notification.find({ user: userId })
    .sort({ created_at: -1 })
    .limit(50)
    .lean();
};

/**
 * Mark a single notification as read
 */
const markAsRead = async (notifId, userId) => {
  const notif = await Notification.findOne({ _id: notifId, user: userId });
  if (!notif) throw new Error("Notification not found");
  notif.is_read = true;
  await notif.save();
  return notif;
};

/**
 * Mark all unread notifications as read for a user
 */
const markAllRead = async (userId) => {
  await Notification.updateMany({ user: userId, is_read: false }, { is_read: true });
};

/**
 * Delete a notification (owner only)
 */
const deleteNotification = async (notifId, userId) => {
  const notif = await Notification.findOne({ _id: notifId, user: userId });
  if (!notif) throw new Error("Notification not found");
  await notif.deleteOne();
};

module.exports = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
};
