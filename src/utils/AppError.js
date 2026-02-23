/**
 * Error with HTTP status code for validation / business rule failures (4xx).
 * Use statusCode 400 for bad request, 422 for validation, etc.
 */
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

module.exports = AppError;
