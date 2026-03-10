const { trimObject } = require('./util');

const catchAsync = (fn) => (req, res, next) => {
  req.body = trimObject(req.body);
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

module.exports = catchAsync;
