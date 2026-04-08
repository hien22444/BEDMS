const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { registerChatEvents } = require('./chat.socket');

/**
 * Initialize Socket.io on the HTTP server.
 * Returns the io instance so app.js can reference it if needed.
 */
const initSocket = (httpServer) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  // ─── JWT Auth Middleware ────────────────────────────────
  // Runs before every connection. Validates token from handshake.auth.token.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication token required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select('email role is_active');
      if (!user || !user.is_active) return next(new Error('Invalid or inactive user'));

      // Attach user info to socket for use in event handlers
      socket.user = { id: user._id.toString(), email: user.email, role: user.role };
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection Handler ─────────────────────────────────
  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    console.log(`[Socket] Connected: ${socket.user.email} (${role}) — ${socket.id}`);

    // Every user joins their personal room for direct push notifications.
    // e.g. io.to(`user_${userId}`).emit('new_notification', {...})
    socket.join(`user_${id}`);

    // Managers also join a global room so student messages can trigger
    // real-time badge updates on the conversation list
    if (role === 'manager') {
      socket.join('managers');
    }

    // Security and admin users join a room to receive live camera detection events
    if (role === 'security' || role === 'admin') {
      socket.join('security_cameras');
    }

    // Register chat event handlers
    registerChatEvents(io, socket);

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${id} — ${socket.id}`);
    });
  });

  return io;
};

module.exports = { initSocket };
