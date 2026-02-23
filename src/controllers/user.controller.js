const { status } = require("http-status");
const { userService } = require("../services");
const catchAsync = require("../utils/catchAsync");

const getAllUsers = catchAsync(async (req, res) => {
  const data = await userService.getAllUsers();

  res.success(data, status.OK);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUser(req.params.id);

  res.success("User Deleted", status.CREATED);
});

const importExcel = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new Error("Please upload an Excel file (.xlsx)");
  }

  const result = await userService.importFromExcel(req.file.buffer);

  res.success(result, status.OK);
});

module.exports = {
  getAllUsers,
  deleteUser,
  importExcel,
};
