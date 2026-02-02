const { status } = require("http-status");
const { authService } = require("../services");
const catchAsync = require("../utils/catchAsync");

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

const login = catchAsync(async (req, res) => {
  const data = await authService.login(req.body);

  // Set token in cookie
  res.cookie("token", data.token, COOKIE_OPTIONS);

  res.success(data, status.CREATED);
});

const register = catchAsync(async (req, res) => {
  const data = await authService.register(req.body);

  // Set token in cookie
  res.cookie("token", data.token, COOKIE_OPTIONS);

  res.success(data, status.CREATED);
});

const logout = catchAsync(async (req, res) => {
  res.clearCookie("token");
  res.success({ message: "Logged out successfully" }, status.OK);
});

module.exports = {
  login,
  register,
  logout,
};
