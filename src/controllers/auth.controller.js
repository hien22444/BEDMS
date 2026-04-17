const { status: httpStatus } = require('http-status');
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
 *
 * Stores tokens in a short-lived server-side store and redirects FE with a
 * one-time exchange code instead of exposing tokens in the URL.
 */
const googleCallback = catchAsync(async (req, res) => {
  const { user, profile } = req.user;

  const tokenPayload = { id: user._id, role: user.role };
  const token = authService.generateToken(tokenPayload);
  const refreshTkn = authService.generateRefreshToken(tokenPayload);

  const userData = {
    id: user._id,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login: user.last_login,
    fullname: user.fullname,
    google_id: user.google_id,
  };

  // Store sensitive data server-side; give FE a one-time opaque code
  const code = authService.storeOAuthData({
    token,
    refreshToken: refreshTkn,
    user: userData,
    profile,
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/auth/google/callback?code=${code}`);
});

/**
 * Exchange one-time OAuth code for tokens
 * GET /v1/auth/google/exchange?code=<code>
 */
const exchangeOAuthCode = catchAsync(async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'Missing code' });
  }
  const data = authService.exchangeOAuthCode(code);
  res.success(data, httpStatus.OK);
});

/**
 * Refresh access token
 * POST /v1/auth/refresh-token
 */
const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;
  const data = await authService.refreshAccessToken(token);
  res.success(data, httpStatus.OK);
});

/**
 * Login as a student (Manager only)
 * POST /v1/auth/login-as-student
 */
const loginAsStudent = catchAsync(async (req, res) => {
  const { student_code } = req.body;
  const data = await authService.loginAsStudent(student_code);
  res.success(data, httpStatus.OK);
});

module.exports = {
  login,
  register,
  getProfile,
  loginAsStudent,
  googleCallback,
  exchangeOAuthCode,
  refreshToken,
};
