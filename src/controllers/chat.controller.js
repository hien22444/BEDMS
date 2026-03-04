const { status } = require('http-status');
const { chatService } = require('../services');
const catchAsync = require('../utils/catchAsync');

// ─── Student endpoints ──────────────────────────────────────

const getMyConversation = catchAsync(async (req, res) => {
  const data = await chatService.getOrCreateConversation(req.user.id);
  res.success(data, status.OK);
});

const getMyConversations = catchAsync(async (req, res) => {
  const data = await chatService.getStudentConversations(req.user.id, req.query);
  res.success(data, status.OK);
});

const closeMyConversation = catchAsync(async (req, res) => {
  const data = await chatService.closeMyConversation(req.user.id);
  res.success(data, status.OK);
});

// ─── Manager endpoints ─────────────────────────────────────

const getConversations = catchAsync(async (req, res) => {
  const data = await chatService.getConversations(req.query);
  res.success(data, status.OK);
});

const assignConversation = catchAsync(async (req, res) => {
  const data = await chatService.assignConversation(req.params.id, req.user.id);
  res.success(data, status.OK);
});

const closeConversation = catchAsync(async (req, res) => {
  const data = await chatService.closeConversation(req.params.id, req.user.id);
  res.success(data, status.OK);
});

// ─── Shared endpoints ─────────────────────────────────────

const getMessages = catchAsync(async (req, res) => {
  const data = await chatService.getMessages(
    req.params.id,
    req.user.id,
    req.user.role,
    req.query
  );
  res.success(data, status.OK);
});

const markAsRead = catchAsync(async (req, res) => {
  await chatService.markAsRead(req.params.id, req.user.id, req.user.role);
  res.success({ message: 'Marked as read' }, status.OK);
});

module.exports = {
  getMyConversation,
  getMyConversations,
  closeMyConversation,
  getConversations,
  assignConversation,
  closeConversation,
  getMessages,
  markAsRead,
};
