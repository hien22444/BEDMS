const mongoose = require('mongoose');
const { ChatConversation, ChatMessage } = require('../models');
const notificationService = require('./notification.service');

// ─── Student ───────────────────────────────────────────────

/**
 * Get existing open conversation or create a new one for the student.
 * Enforces 1 student = 1 open conversation at a time.
 */
const getOrCreateConversation = async (studentUserId) => {
  let conversation = await ChatConversation.findOne({
    student: studentUserId,
    status: 'open',
  })
    .populate('student', 'email fullname')
    .populate('staff', 'email fullname');

  if (!conversation) {
    conversation = await ChatConversation.create({ student: studentUserId });
    conversation = await ChatConversation.findById(conversation._id)
      .populate('student', 'email fullname')
      .populate('staff', 'email fullname');
  }

  return conversation;
};

/**
 * Student closes their own open conversation.
 */
const closeMyConversation = async (studentUserId) => {
  const conversation = await ChatConversation.findOne({
    student: studentUserId,
    status: 'open',
  });

  if (!conversation) {
    const err = new Error('No open conversation found');
    err.statusCode = 404;
    throw err;
  }

  conversation.status = 'closed';
  await conversation.save();
  return conversation;
};

// ─── Student history ───────────────────────────────────────

/**
 * Get paginated list of ALL conversations (open + closed) for a specific student.
 * Sorted by latest activity — newest first.
 */
const getStudentConversations = async (studentUserId, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ChatConversation.find({ student: studentUserId })
      .populate('staff', 'email fullname')
      .sort({ last_message_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    ChatConversation.countDocuments({ student: studentUserId }),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

// ─── Manager ───────────────────────────────────────────────

/**
 * Get paginated list of conversations for manager.
 * Default: open conversations sorted by latest activity.
 * Uses regular Mongoose docs (not lean) so toJSON virtuals (id) are applied.
 */
const getConversations = async ({ status = 'open', page = 1, limit = 20 } = {}) => {
  // Only show conversations that have at least one message (last_message_at is set).
  // Conversations created by getOrCreateConversation but with no messages yet are hidden.
  const query = { last_message_at: { $ne: null } };
  if (status !== 'all') query.status = status;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ChatConversation.find(query)
      .populate('student', 'email fullname')
      .populate('staff', 'email fullname')
      .sort({ last_message_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    ChatConversation.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

/**
 * Manager assigns themselves to a conversation (pick up).
 * Atomic: only assigns if staff is currently null (prevents race condition).
 */
const assignConversation = async (conversationId, managerUserId) => {
  const conversation = await ChatConversation.findOneAndUpdate(
    { _id: conversationId, status: 'open', staff: null },
    { staff: managerUserId },
    { new: true }
  )
    .populate('student', 'email fullname')
    .populate('staff', 'email fullname');

  if (!conversation) {
    // Distinguish: not found vs closed vs already assigned
    const existing = await ChatConversation.findById(conversationId);
    if (!existing) {
      const err = new Error('Conversation not found');
      err.statusCode = 404;
      throw err;
    }
    if (existing.status === 'closed') {
      const err = new Error('Conversation is already closed');
      err.statusCode = 400;
      throw err;
    }
    const err = new Error('Conversation already picked up by another manager');
    err.statusCode = 409;
    throw err;
  }

  return conversation;
};

/**
 * Manager closes a conversation.
 */
const closeConversation = async (conversationId, managerUserId) => {
  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }
  if (conversation.status === 'closed') {
    const err = new Error('Conversation is already closed');
    err.statusCode = 400;
    throw err;
  }

  // Only the assigned manager may close the conversation
  if (conversation.staff && conversation.staff.toString() !== managerUserId.toString()) {
    const err = new Error('Only the assigned manager can close this conversation');
    err.statusCode = 403;
    throw err;
  }

  conversation.status = 'closed';
  conversation.staff = conversation.staff || managerUserId;
  await conversation.save();

  // Notify the student that their conversation was closed
  notificationService.createNotification(conversation.student.toString(), {
    title: 'Conversation Closed',
    message: 'Your support conversation has been closed by the manager. You can start a new one anytime.',
    notification_type: 'info',
    category: 'general',
    related_id: conversationId,
  }).catch((err) => console.error('[Chat] Failed to create close notification:', err.message));

  return conversation;
};

// ─── Shared ────────────────────────────────────────────────

/**
 * Load paginated messages for a conversation.
 * Validates that the requesting user belongs to this conversation.
 */
const getMessages = async (conversationId, userId, userRole, { page = 1, limit = 50 } = {}) => {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(100, Math.max(1, Number(limit) || 50));
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error('Invalid conversation ID');
    err.statusCode = 400;
    throw err;
  }

  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }

  // Access check: student can only access their own conversation
  // Use toString() on both sides — req.user.id is an ObjectId, not a string
  if (userRole === 'student' && conversation.student.toString() !== userId.toString()) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  const skip = (page - 1) * limit;
  const [messages, total] = await Promise.all([
    ChatMessage.find({ conversation: conversationId })
      .populate('sender', 'email fullname')
      .sort({ sent_at: 1 })
      .skip(skip)
      .limit(limit),
    ChatMessage.countDocuments({ conversation: conversationId }),
  ]);

  return {
    conversation,
    messages,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Save a new message and update conversation metadata atomically.
 * Returns the saved message with sender populated.
 */
const saveMessage = async (conversationId, senderUserId, senderType, messageText) => {
  if (!messageText || messageText.length > 1000) {
    const err = new Error('Message must be between 1 and 1000 characters');
    err.statusCode = 400;
    throw err;
  }

  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation || conversation.status === 'closed') {
    const err = new Error('Conversation not found or closed');
    err.statusCode = 400;
    throw err;
  }

  // Access control: student can only send to their own conversation
  if (senderType === 'student' && conversation.student.toString() !== senderUserId.toString()) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  // Access control: staff must pick up the conversation before sending
  if (senderType === 'staff' && !conversation.staff) {
    const err = new Error('Pick up the conversation first before sending messages');
    err.statusCode = 403;
    throw err;
  }

  // Access control: if conversation is already assigned, only that manager can send
  if (senderType === 'staff' && conversation.staff && conversation.staff.toString() !== senderUserId.toString()) {
    const err = new Error('This conversation is already handled by another manager');
    err.statusCode = 403;
    throw err;
  }

  const message = await ChatMessage.create({
    conversation: conversationId,
    sender: senderUserId,
    sender_type: senderType,
    message_text: messageText,
    sent_at: new Date(),
  });

  // Increment unread for the OTHER side atomically
  const unreadField = senderType === 'student' ? 'manager_unread' : 'student_unread';
  await ChatConversation.findByIdAndUpdate(conversationId, {
    last_message_at: message.sent_at,
    $inc: { [unreadField]: 1 },
  });

  return ChatMessage.findById(message._id).populate('sender', 'email fullname');
};

/**
 * Mark all unread messages in a conversation as read (from the other side).
 * Resets the unread counter on the conversation document.
 */
const markAsRead = async (conversationId, userId, userRole) => {
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) return;

  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation) return;

  // Use toString() on both sides — userId may be ObjectId
  if (userRole === 'student' && conversation.student.toString() !== userId.toString()) return;

  const senderType = userRole === 'student' ? 'staff' : 'student';
  const unreadField = userRole === 'student' ? 'student_unread' : 'manager_unread';

  await Promise.all([
    ChatMessage.updateMany(
      { conversation: conversationId, sender_type: senderType, is_read: false },
      { $set: { is_read: true } }
    ),
    ChatConversation.findByIdAndUpdate(conversationId, {
      $set: { [unreadField]: 0 },
    }),
  ]);
};

module.exports = {
  getOrCreateConversation,
  closeMyConversation,
  getStudentConversations,
  getConversations,
  assignConversation,
  closeConversation,
  getMessages,
  saveMessage,
  markAsRead,
};
