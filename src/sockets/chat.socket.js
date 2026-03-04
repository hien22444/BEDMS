const { chatService } = require('../services');
const { ChatConversation, Notification, User } = require('../models');

/**
 * Register all chat socket events on a connected, authenticated socket.
 * socket.user is populated by the auth middleware in sockets/index.js
 */
const registerChatEvents = (io, socket) => {
  const { id: userId, role } = socket.user;
  const senderType = role === 'student' ? 'student' : 'staff';

  // ─── join_conversation ────────────────────────────────────
  // Client joins a conversation room to receive real-time messages.
  // Student can only join their own conversation.
  // Manager can join any conversation.
  socket.on('join_conversation', async ({ conversationId }) => {
    try {
      const conversation = await ChatConversation.findById(conversationId);
      if (!conversation) return;

      // Access guard for student — userId is ObjectId, must use toString() on both
      if (role === 'student' && conversation.student.toString() !== userId.toString()) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      socket.join(`conv_${conversationId}`);

      // Auto mark as read when joining
      await chatService.markAsRead(conversationId, userId, role);

      // Notify other side that messages have been read
      socket.to(`conv_${conversationId}`).emit('conversation_read', {
        conversationId,
        by: role,
      });
    } catch (err) {
      console.error('[Socket] join_conversation error:', err.message);
    }
  });

  // ─── leave_conversation ───────────────────────────────────
  socket.on('leave_conversation', ({ conversationId }) => {
    socket.leave(`conv_${conversationId}`);
  });

  // ─── send_message ─────────────────────────────────────────
  // Client sends a message. Server saves it, updates unread counts,
  // then broadcasts to everyone in the room.
  socket.on('send_message', async ({ conversationId, text }) => {
    try {
      if (!conversationId || !text?.trim()) return;

      const message = await chatService.saveMessage(
        conversationId,
        userId,
        senderType,
        text.trim()
      );

      // Fetch full populated conversation (needed for manager broadcast + unread counts)
      const conversation = await ChatConversation.findById(conversationId)
        .populate('student', 'email fullname')
        .populate('staff', 'email fullname');
      if (!conversation) return;

      // Broadcast to all in room (including sender)
      io.to(`conv_${conversationId}`).emit('new_message', {
        message,
        conversationId,
        manager_unread: conversation.manager_unread,
        student_unread: conversation.student_unread,
      });

      // Notify student when manager sends a message and student is not in the room.
      // Symmetric to the manager notification block below.
      if (senderType === 'staff' && conversation.student_unread === 1) {
        const roomSockets = io.sockets.adapter.rooms.get(`conv_${conversationId}`);
        let studentIsPresent = false;
        if (roomSockets) {
          for (const sid of roomSockets) {
            const s = io.sockets.sockets.get(sid);
            if (s?.user?.role === 'student') {
              studentIsPresent = true;
              break;
            }
          }
        }

        if (studentIsPresent) {
          // Student is actively viewing — reset unread counter silently
          await ChatConversation.findByIdAndUpdate(conversationId, { student_unread: 0 });
        } else {
          const staffName = conversation.staff?.fullname || conversation.staff?.email || 'Support Agent';
          const studentId = conversation.student._id.toString();
          try {
            await Notification.create({
              user: conversation.student._id,
              title: 'New Message from Support',
              message: `${staffName} replied to your conversation`,
              notification_type: 'info',
              category: 'chat',
              related_id: conversationId,
            });
            io.to(`user_${studentId}`).emit('new_notification', {
              title: 'New Message from Support',
              message: `${staffName} replied to your conversation`,
            });
          } catch (notifErr) {
            console.error('[Socket] student notification creation failed:', notifErr.message);
          }
        }
      }

      // Notify managers room — includes full conversation so FE can prepend
      // new conversations that were not yet visible in the manager's list.
      if (senderType === 'student') {
        io.to('managers').emit('conversation_updated', {
          conversation,  // socket.io serialises via toJSON() — includes id virtual + populated fields
          conversationId,
          manager_unread: conversation.manager_unread,
          last_message_at: message.sent_at,
        });

        // Create DB notification + real-time push on first unread message in a batch.
        // manager_unread === 1 means it was 0 before this message → new unread batch started.
        // Skip if a manager is already present in the conversation room (they're actively reading).
        if (conversation.manager_unread === 1) {
          // Check if any manager socket is currently in this conversation room
          const roomSockets = io.sockets.adapter.rooms.get(`conv_${conversationId}`);
          let managerIsPresent = false;
          if (roomSockets) {
            for (const sid of roomSockets) {
              const s = io.sockets.sockets.get(sid);
              if (s?.user?.role !== 'student') {
                managerIsPresent = true;
                break;
              }
            }
          }

          if (managerIsPresent) {
            // Manager is actively viewing the conversation — reset unread counter silently
            await ChatConversation.findByIdAndUpdate(conversationId, { manager_unread: 0 });
          } else {
            const studentName =
              conversation.student?.fullname || conversation.student?.email || 'A student';

            try {
              if (!conversation.staff) {
                // Unassigned conversation — alert all active managers
                const managers = await User.find({ role: 'manager', is_active: true })
                  .select('_id')
                  .lean();
                if (managers.length > 0) {
                  await Notification.insertMany(
                    managers.map((m) => ({
                      user: m._id,
                      title: 'New Support Request',
                      message: `${studentName} started a new support conversation`,
                      notification_type: 'info',
                      category: 'chat',
                      related_id: conversationId,
                    }))
                  );
                  const notifPayload = {
                    title: 'New Support Request',
                    message: `${studentName} started a new support conversation`,
                  };
                  managers.forEach((m) => {
                    io.to(`user_${m._id.toString()}`).emit('new_notification', notifPayload);
                  });
                }
              } else {
                // Assigned conversation — notify the specific manager only
                const staffId = conversation.staff._id.toString();
                await Notification.create({
                  user: conversation.staff._id,
                  title: 'New Message from Student',
                  message: `${studentName} sent a message in your conversation`,
                  notification_type: 'info',
                  category: 'chat',
                  related_id: conversationId,
                });
                io.to(`user_${staffId}`).emit('new_notification', {
                  title: 'New Message from Student',
                  message: `${studentName} sent a message in your conversation`,
                });
              }
            } catch (notifErr) {
              console.error('[Socket] notification creation failed:', notifErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Socket] send_message error:', err.message);
      // Pass through business-logic errors (403 etc.) so FE can display them
      socket.emit('error', { message: err.statusCode ? err.message : 'Failed to send message' });
    }
  });

  // ─── close_conversation ───────────────────────────────────
  // Called by FE after REST API close succeeds.
  // Broadcasts conversation_closed to everyone in the room (student + manager).
  // Also sends new_notification to the student's personal room so they get
  // notified even if they are not currently on the chat page.
  socket.on('close_conversation', async ({ conversationId }) => {
    if (!conversationId) return;

    // Broadcast to conversation room (student sees UI update if they're on chat page)
    io.to(`conv_${conversationId}`).emit('conversation_closed', { conversationId });
    socket.leave(`conv_${conversationId}`);

    // Push real-time notification to student's personal room
    try {
      const conv = await ChatConversation.findById(conversationId).select('student').lean();
      if (conv?.student) {
        io.to(`user_${conv.student.toString()}`).emit('new_notification', {
          title: 'Conversation Closed',
          message: 'Your support conversation has been closed by the manager. You can start a new one anytime.',
        });
      }
    } catch (err) {
      console.error('[Socket] close_conversation: failed to push notification to student:', err.message);
    }
  });

  // ─── mark_read ────────────────────────────────────────────
  socket.on('mark_read', async ({ conversationId }) => {
    try {
      await chatService.markAsRead(conversationId, userId, role);
      socket.to(`conv_${conversationId}`).emit('conversation_read', {
        conversationId,
        by: role,
      });
    } catch (err) {
      console.error('[Socket] mark_read error:', err.message);
    }
  });
};

module.exports = { registerChatEvents };
