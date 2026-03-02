require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const passport = require('./src/config/passport');
const routes = require('./src/routes');
const responseHandler = require('./src/middleware/responseHandle');
const { mongo } = require('./src/utils');
const { initSocket } = require('./src/sockets');
const { scheduleVisitorExpiry } = require('./src/jobs/visitorScheduler');

const app = express();
const httpServer = http.createServer(app);

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());

app.use(responseHandler);

// v1 api routes
app.use('/', routes);

app.use('*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler — don't leak internal details in production
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV === 'develop' || process.env.NODE_ENV === 'development';

  if (isDev) {
    console.error(err.stack);
  }

  res.status(500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
  });
});

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await mongo.connect();
  scheduleVisitorExpiry();
  initSocket(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}/v1`);
  });
};

startServer();

module.exports = app;
