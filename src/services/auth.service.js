const jwt = require("jsonwebtoken");
const { User, Student, Staff } = require("../models");

/**
 * Generate access token (short-lived)
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
};

/**
 * Generate refresh token (long-lived)
 * @param {Object} payload - Token payload
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
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

  // Special-case: built-in admin account (username: admin, password: admin)
  if (email === "admin" && password === "admin") {
    // Ensure there is a real User document to back this admin
    const adminEmail = "admin@dorm.local";

    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      adminUser = await User.create({
        email: adminEmail,
        password_hash: password, // hashed by pre-save hook
        role: "admin",
        fullname: "System Admin",
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
    throw new Error("Email and password are required");
  }

  if (!isValidEmail(email)) {
    throw new Error("Invalid email format");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new Error("Account not authorized. Please contact the dormitory management office.");
  }

  if (!user.is_active) {
    throw new Error("Account has been locked. Please contact the dormitory management office.");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error("Incorrect password");
  }

  user.last_login = new Date();
  await user.save();

  let profile = null;
  if (user.role === "student") {
    profile = await Student.findOne({ user: user._id });
  } else if (user.role === "manager" || user.role === "security") {
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
 * @param {string} token - Refresh token
 * @returns {Object} { token, refreshToken }
 */
const refreshAccessToken = async (token) => {
  if (!token) {
    throw new Error("Refresh token is required");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Verify user still exists and is active
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new Error("User not found");
  }
  if (!user.is_active) {
    throw new Error("Account has been locked");
  }

  const tokenPayload = { id: user._id, role: user.role };
  const newToken = generateToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  return {
    token: newToken,
    refreshToken: newRefreshToken,
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
  const { email, password, role = "student" } = body;

  // Validation
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  if (!isValidEmail(email)) {
    throw new Error("Invalid email format");
  }

  if (!isValidPassword(password)) {
    throw new Error(
      "Password must be at least 8 characters, including uppercase, lowercase and a number"
    );
  }

  // Validate role
  const validRoles = ["student", "manager", "security", "admin"];
  if (!validRoles.includes(role)) {
    throw new Error("Invalid role");
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    throw new Error("Email is already in use");
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
    throw new Error("User not found");
  }

  let profile = null;
  if (user.role === "student") {
    profile = await Student.findOne({ user: user._id });
  } else if (user.role === "manager" || user.role === "security") {
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

module.exports = {
  login,
  register,
  getProfile,
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
};
