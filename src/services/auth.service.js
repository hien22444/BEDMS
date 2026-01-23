const jwt = require("jsonwebtoken");
const { User } = require("../models");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

const login = async (body) => {
  const { username, password } = body;

  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  const user = await User.findOne({ username });
  if (!user) {
    throw new Error("User not found");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = generateToken(user._id);

  return {
    token,
    user,
  };
};

const register = async (body) => {
  const { username, password } = body;

  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    throw new Error("User already exists");
  }

  const user = await User.create({ username, password });
  const token = generateToken(user._id);

  return {
    token,
    user,
  };
};

module.exports = {
  login,
  register,
};
