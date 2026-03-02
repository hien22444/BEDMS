const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { chatController } = require('../../controllers');

const router = express.Router();

// ─── Student endpoints ──────────────────────────────────────

// Get or create open conversation (student)
router.get(
  '/my-conversation',
  authenticate,
  authorize('student'),
  chatController.getMyConversation
);

// Get all conversations for a student (history — open + closed)
router.get(
  '/my-conversations',
  authenticate,
  authorize('student'),
  chatController.getMyConversations
);

// Student closes their own conversation
router.patch(
  '/my-conversation/close',
  authenticate,
  authorize('student'),
  chatController.closeMyConversation
);

// ─── Manager endpoints ─────────────────────────────────────

// List all conversations with filters (manager)
router.get(
  '/conversations',
  authenticate,
  authorize('manager'),
  chatController.getConversations
);

// Manager picks up a conversation (assign self as staff)
router.patch(
  '/conversations/:id/assign',
  authenticate,
  authorize('manager'),
  chatController.assignConversation
);

// Manager closes a conversation
router.patch(
  '/conversations/:id/close',
  authenticate,
  authorize('manager'),
  chatController.closeConversation
);

// ─── Shared endpoints ─────────────────────────────────────

// Load messages for a conversation (both roles)
router.get(
  '/conversations/:id/messages',
  authenticate,
  authorize('student', 'manager'),
  chatController.getMessages
);

// Mark messages as read (both roles)
router.patch(
  '/conversations/:id/read',
  authenticate,
  authorize('student', 'manager'),
  chatController.markAsRead
);

module.exports = router;
