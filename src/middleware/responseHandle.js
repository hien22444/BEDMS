module.exports = (req, res, next) => {
  res.success = (data = null, statusCode = 200) => {
    res.status(statusCode).json({
      success: true,
      statusCode,
      data,
    });
  };
  next();
};
