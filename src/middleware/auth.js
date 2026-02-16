const jwt = require('jsonwebtoken');
const { User } = require('../models');
const httpStatus = require('http-status');

/**
 * Middleware to authenticate JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Authentication token not found',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Invalid token - User not found',
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Account has been locked',
      });
    }

    // Attach user to request
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Invalid token',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Token has expired',
      });
    }

    const statusCode =
      typeof httpStatus.INTERNAL_SERVER_ERROR === "number"
        ? httpStatus.INTERNAL_SERVER_ERROR
        : 500;

    return res.status(statusCode).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

/**
 * Middleware to check user roles
 * @param  {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: 'You do not have permission to access this feature',
      });
    }

    next();
  };
};

// Export both named and default for backward compatibility
module.exports = {
  authenticate,
  authorize,
};
module.exports.default = authenticate;
