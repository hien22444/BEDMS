const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { default: status } = require('http-status');

const auth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(status.UNAUTHORIZED).json({
        success: false,
        message: 'Not authorized, no token provided',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(status.UNAUTHORIZED).json({
        success: false,
        message: 'Not authorized, user not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(status.UNAUTHORIZED).json({
        success: false,
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(status.UNAUTHORIZED).json({
        success: false,
        message: 'Token expired',
      });
    }

    res.status(status.UNAUTHORIZED).json({
      success: false,
      message: error.message || 'Authentication failed',
    });
  }
};

module.exports = auth;
