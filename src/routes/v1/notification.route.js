const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { notificationController } = require('../../controllers');

const router = express.Router();

// All notification routes require authentication (any role)
router.get('/', authenticate, notificationController.getMyNotifications);
router.patch('/read-all', authenticate, notificationController.markAllRead);
router.patch('/:id/read', authenticate, notificationController.markAsRead);
router.delete('/clear-all', authenticate, notificationController.clearAll);
router.delete('/:id', authenticate, notificationController.deleteNotification);

module.exports = router;
