require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const path = require('path');
const passport = require('./config/passport');
const responseHandler = require('./middleware/responseHandle');
const { scheduleVisitorExpiry } = require('./jobs/visitorScheduler');
const { scheduleBookingExpiry, scheduleContractActivation } = require('./jobs/bookingExpiryScheduler');
const { confirmPayosWebhook } = require('./services/payos.service');

const app = express();

// Security headers
app.use(helmet());

// CORS — configurable via environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language'],
  })
);
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(responseHandler);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// v1 api routes
app.use('/', routes);

app.use('*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV === 'develop' || process.env.NODE_ENV === 'development';

  if (isDev) {
    console.error(err.stack);
  }

  // AppError = expected business rule / validation failure (4xx) — always expose the message
  if (err.name === 'AppError') {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
    });
  }

  // PayOS SDK (not wrapped in AppError in some code paths)
  if (err.name === 'APIError' || err.name === 'PayOSError') {
    return res.status(502).json({
      success: false,
      message: err.message || 'Payment provider error',
    });
  }

  if (err.name === 'ValidationError' && err.errors) {
    const msg = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    return res.status(400).json({
      success: false,
      message: msg || err.message || 'Validation failed',
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: isDev ? err.message : 'Duplicate record',
    });
  }

  res.status(500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
  });
});

scheduleVisitorExpiry();
scheduleBookingExpiry();
scheduleContractActivation();
confirmPayosWebhook();

module.exports = app;
