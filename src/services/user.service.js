const { User } = require("../models");

const getAllUsers = async () => {
  const users = await User.find();

  return users;
};

const deleteUser = async (id) => {
  const user = await User.findById(id).populate({ path: "totalOrder" });

  if (!user) {
    throw new Error("User not found");
  }

  if (!!user.totalOrder) {
    throw new Error("Cannot delete users with existing orders");
  }

  await user.deleteOne({
    _id: id,
  });
};

module.exports = {
  getAllUsers,
  deleteUser,
};
