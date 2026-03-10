const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, Student, Staff } = require('../models');

// Hash ADMIN_PASSWORD once at first use (prevents plaintext string comparison + timing attacks).
// The raw password stays in .env for human readability; comparison is via bcrypt constant-time.
let _adminPasswordHash = null;
const getAdminPasswordHash = async () => {
  if (_adminPasswordHash !== null) return _adminPasswordHash;
  const raw = process.env.ADMIN_PASSWORD;
  if (!raw) {
    _adminPasswordHash = false;
    return false;
  }
  _adminPasswordHash = await bcrypt.hash(raw, 10);
  return _adminPasswordHash;
};

/**
 * Generate access token (short-lived)
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
};

/**
 * Generate refresh token (long-lived)
 * @param {Object} payload - Token payload
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password
 * @returns {boolean}
 */
const isValidPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Login user
 * @param {Object} body - { email, password }
 * @returns {Object} { token, refreshToken, user, profile }
 */
const login = async (body) => {
  const { email, password } = body;

  // Special-case: built-in admin account (credentials from .env)
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPasswordHash = await getAdminPasswordHash();
  if (
    adminPasswordHash &&
    email === adminUsername &&
    (await bcrypt.compare(password, adminPasswordHash))
  ) {
    // Ensure there is a real User document to back this admin
    const adminEmail = 'admin@dorm.local';

    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      adminUser = await User.create({
        email: adminEmail,
        password_hash: password, // hashed by pre-save hook
        role: 'admin',
        fullname: 'System Admin',
        is_active: true,
      });
    }

    // Update last_login
    adminUser.last_login = new Date();
    await adminUser.save();

    const tokenPayload = { id: adminUser._id, role: adminUser.role };
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      token,
      refreshToken,
      user: {
        id: adminUser._id,
        email: adminUser.email,
        role: adminUser.role,
        is_active: adminUser.is_active,
        last_login: adminUser.last_login,
      },
      profile: null,
    };
  }

  // Normal login flow (email/password)
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  if (!isValidEmail(email)) {
    throw new Error('Invalid email format');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new Error('Account not authorized. Please contact the dormitory management office.');
  }

  if (!user.is_active) {
    throw new Error('Account has been locked. Please contact the dormitory management office.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  user.last_login = new Date();
  await user.save();

  let profile = null;
  if (user.role === 'student') {
    profile = await Student.findOne({ user: user._id });
  } else if (user.role === 'manager' || user.role === 'security') {
    profile = await Staff.findOne({ user: user._id });
  }

  const tokenPayload = { id: user._id, role: user.role };
  const token = generateToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    token,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      last_login: user.last_login,
    },
    profile,
  };
};

/**
 * Refresh access token using a valid refresh token
 * Only returns a new access token — refresh token is NOT rotated
 * so it expires naturally after 7d, forcing re-login
 * @param {string} token - Refresh token
 * @returns {Object} { token }
 */
const refreshAccessToken = async (token) => {
  if (!token) {
    throw new Error('Refresh token is required');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Verify user still exists and is active
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new Error('User not found');
  }
  if (!user.is_active) {
    throw new Error('Account has been locked');
  }

  const tokenPayload = { id: user._id, role: user.role };
  const newToken = generateToken(tokenPayload);

  // Do NOT rotate refresh token — keep the original so it expires naturally
  return {
    token: newToken,
  };
};

/**
 * Register new user (Admin only - for creating accounts via API)
 * NOTE: This should ONLY be called by admin users
 * Normal users must be imported from Excel - NO self-registration allowed
 * @param {Object} body - { email, password, role }
 * @returns {Object} { token, user }
 */
const register = async (body) => {
  const { email, password, role = 'student' } = body;

  // Validation
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  if (!isValidEmail(email)) {
    throw new Error('Invalid email format');
  }

  if (!isValidPassword(password)) {
    throw new Error(
      'Password must be at least 8 characters, including uppercase, lowercase and a number'
    );
  }

  // Validate role
  const validRoles = ['student', 'manager', 'security', 'admin'];
  if (!validRoles.includes(role)) {
    throw new Error('Invalid role');
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    throw new Error('Email is already in use');
  }

  // Create user
  const user = await User.create({
    email: email.toLowerCase().trim(),
    password_hash: password, // Will be hashed by pre-save hook
    role,
    is_active: true,
  });

  // Generate token
  const token = generateToken({
    id: user._id,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    },
  };
};

/**
 * Get current user profile
 * @param {string} userId
 * @returns {Object} { user, profile }
 */
const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  let profile = null;
  if (user.role === 'student') {
    profile = await Student.findOne({ user: user._id });
  } else if (user.role === 'manager' || user.role === 'security') {
    profile = await Staff.findOne({ user: user._id });
  }

  return {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      last_login: user.last_login,
    },
    profile,
  };
};

// ─── OAuth one-time code exchange store ───────────────────────────────────────
// Stores { token, refreshToken, user, profile } keyed by a random code.
// TTL: 5 minutes. Each code is single-use (deleted after exchange).
const crypto = require('crypto');
const _oauthStore = new Map();

const storeOAuthData = (data) => {
  // Purge expired entries
  const now = Date.now();
  for (const [k, v] of _oauthStore.entries()) {
    if (v.expiresAt < now) _oauthStore.delete(k);
  }
  const code = crypto.randomBytes(32).toString('hex');
  _oauthStore.set(code, { data, expiresAt: now + 5 * 60 * 1000 });
  return code;
};

const exchangeOAuthCode = (code) => {
  const entry = _oauthStore.get(code);
  if (!entry || entry.expiresAt < Date.now()) {
    _oauthStore.delete(code);
    throw new Error('Invalid or expired OAuth code');
  }
  _oauthStore.delete(code); // single-use
  return entry.data;
};

module.exports = {
  login,
  register,
  getProfile,
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
  storeOAuthData,
  exchangeOAuthCode,
};
