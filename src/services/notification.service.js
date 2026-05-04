const { Notification, User } = require('../models');

/**
 * Create a notification for a user
 */
const createNotification = async (
  userId,
  { title, message, category, notification_type = 'info', related_id }
) => {
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
  // Do NOT use .lean() — the schema's toJSON transform adds the virtual `id`
  // field and removes `_id`/`__v`. Without it, n.id is undefined on the FE.
  return Notification.find({ user: userId }).sort({ created_at: -1 }).limit(50);
};

/**
 * Mark a single notification as read
 */
const markAsRead = async (notifId, userId) => {
  if (!notifId || notifId === 'undefined') throw new Error('Invalid notification id');
  const notif = await Notification.findOne({ _id: notifId, user: userId });
  if (!notif) throw new Error('Notification not found');
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
  if (!notifId || notifId === 'undefined') throw new Error('Invalid notification id');
  const notif = await Notification.findOne({ _id: notifId, user: userId });
  if (!notif) throw new Error('Notification not found');
  await notif.deleteOne();
};

/**
 * Delete all notifications for a user (clear all)
 */
const clearAll = async (userId) => {
  await Notification.deleteMany({ user: userId });
};

/**
 * Create the same notification for every user with role 'security' (and 'admin').
 * Emits one Socket.io event per created notification, scoped to the security_cameras room
 * — frontends filter by user id locally.
 *
 * @param {{ title, message, category, notification_type, related_id }} payload
 * @param {object} [io] Socket.io server instance for live emission (optional)
 * @returns {Promise<Array>} created notification documents
 */
const createSecurityNotifications = async (payload, io) => {
  const recipients = await User.find({ role: { $in: ['security', 'admin'] } })
    .select('_id')
    .lean();
  if (recipients.length === 0) return [];

  const docs = recipients.map((u) => ({
    user: u._id,
    title: payload.title,
    message: payload.message,
    notification_type: payload.notification_type || 'info',
    category: payload.category,
    related_id: payload.related_id,
  }));

  const created = await Notification.insertMany(docs);

  if (io) {
    for (const notif of created) {
      // Emit JSON-serialized form so the FE receives the virtual `id` field.
      io.to('security_cameras').emit('notification_created', notif.toJSON());
    }
  }

  return created;
};

module.exports = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  clearAll,
  createSecurityNotifications,
};
