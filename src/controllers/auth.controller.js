const { status } = require("http-status");
const { authService } = require("../services");
const catchAsync = require("../utils/catchAsync");

const login = catchAsync(async (req, res) => {
  const data = await authService.login(req.body);

  res.success(data, status.CREATED);
});

const register = catchAsync(async (req, res) => {
  const data = await authService.register(req.body);

  res.success(data, status.CREATED);
});

module.exports = {
  login,
  register,
};
