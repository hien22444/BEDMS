const jwt = require("jsonwebtoken");
const { User, Student, Staff } = require("../models");

/**
 * Generate JWT token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
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
 * @returns {Object} { token, user, profile }
 */
const login = async (body) => {
  const { email, password } = body;

  // Validation
  if (!email || !password) {
    throw new Error("Email và mật khẩu là bắt buộc");
  }

  if (!isValidEmail(email)) {
    throw new Error("Email không hợp lệ");
  }

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new Error("Tài khoản không tồn tại");
  }

  // Check if user is active
  if (!user.is_active) {
    throw new Error("Tài khoản đã bị khóa. Vui lòng liên hệ Ban quản lý KTX");
  }

  // Verify password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error("Mật khẩu không chính xác");
  }

  // Update last_login
  user.last_login = new Date();
  await user.save();

  // Get profile based on role
  let profile = null;
  if (user.role === "student") {
    profile = await Student.findOne({ user: user._id });
  } else if (user.role === "manager" || user.role === "security") {
    profile = await Staff.findOne({ user: user._id });
  }

  // Generate token with role info
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
      last_login: user.last_login,
    },
    profile,
  };
};

/**
 * Register new user (Admin only - for creating staff accounts)
 * For students, use studentService.createStudent()
 * @param {Object} body - { email, password, role }
 * @returns {Object} { token, user }
 */
const register = async (body) => {
  const { email, password, role = "student" } = body;

  // Validation
  if (!email || !password) {
    throw new Error("Email và mật khẩu là bắt buộc");
  }

  if (!isValidEmail(email)) {
    throw new Error("Email không hợp lệ");
  }

  if (!isValidPassword(password)) {
    throw new Error(
      "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số"
    );
  }

  // Validate role
  const validRoles = ["student", "manager", "security", "admin"];
  if (!validRoles.includes(role)) {
    throw new Error("Role không hợp lệ");
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    throw new Error("Email đã được sử dụng");
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
    throw new Error("User không tồn tại");
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
};
