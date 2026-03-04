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

const app = express();
//fix
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
  })
);
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(responseHandler);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// v1 api routes
app.use('/', routes);

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler — don't leak internal details in production
app.use((err, req, res, _next) => {
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

  res.status(500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
  });
});

scheduleVisitorExpiry();

module.exports = app;
