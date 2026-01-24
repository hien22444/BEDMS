const { User } = require('../models');

const getAllUsers = async () => {
  const users = await User.find();
  return users;
};

const deleteUser = async (id) => {
  const user = await User.findById(id).populate({ path: 'totalOrder' });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (user.totalOrder && user.totalOrder > 0) {
    const error = new Error('Cannot delete users with existing orders');
    error.statusCode = 400;
    throw error;
  }

  await user.deleteOne({
    _id: id,
  });
};

module.exports = {
  getAllUsers,
  deleteUser,
};
