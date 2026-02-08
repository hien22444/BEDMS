const httpStatus = require('http-status');
const { authService } = require('../services');
const catchAsync = require('../utils/catchAsync');

/**
 * Login user
 * POST /v1/auth/login
 */
const login = catchAsync(async (req, res) => {
  const data = await authService.login(req.body);
  res.success(data, httpStatus.OK);
});

/**
 * Register new user
 * POST /v1/auth/register
 */
const register = catchAsync(async (req, res) => {
  const data = await authService.register(req.body);
  res.success(data, httpStatus.CREATED);
});

/**
 * Get current user profile
 * GET /v1/auth/profile
 */
const getProfile = catchAsync(async (req, res) => {
  const data = await authService.getProfile(req.user.id);
  res.success(data, httpStatus.OK);
});

/**
 * Google OAuth callback
 * GET /v1/auth/google/callback
 */
const googleCallback = catchAsync(async (req, res) => {
  // User data comes from passport strategy
  const { user, profile } = req.user;

  // Generate JWT token
  const token = authService.generateToken({
    id: user._id,
    role: user.role,
  });

  // Prepare user data for frontend
  const userData = {
    id: user._id,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login: user.last_login,
    fullname: user.fullname,
    google_id: user.google_id,
  };

  // Redirect to frontend with token and user data
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const encodedUser = encodeURIComponent(JSON.stringify(userData));
  const encodedProfile = encodeURIComponent(JSON.stringify(profile));

  res.redirect(
    `${frontendUrl}/auth/google/callback?token=${token}&user=${encodedUser}&profile=${encodedProfile}`
  );
});

const logout = catchAsync(async (req, res) => {
  res.clearCookie('token');
  res.success({ message: 'Logged out successfully' }, status.OK);
});

module.exports = {
  login,
  register,
  getProfile,
  googleCallback,
};
