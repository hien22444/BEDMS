const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { default: status } = require("http-status");

const auth = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header first
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Fallback to cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      throw new Error("Not authorized, no token provided");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      throw new Error("Not authorized, user not found");
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(status.UNAUTHORIZED).json({
      success: false,
      statusCode: status.UNAUTHORIZED,
      message: error.message,
    });
  }
};

module.exports = auth;
