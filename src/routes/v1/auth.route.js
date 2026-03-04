const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { authController } = require('../../controllers');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Rate limiter: max 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for token refresh: max 10 per 15 minutes
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/login', loginLimiter, authController.login);
router.post('/refresh-token', refreshLimiter, authController.refreshToken);

// Admin only - for creating accounts via API (users should be imported from Excel)
router.post('/register', authenticate, authorize('admin'), authController.register);

// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

// Google OAuth callback with custom error handling
router.get(
  '/google/callback',
  (req, res, next) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    passport.authenticate('google', { session: false }, (err, user, info) => {
      // Handle authentication error
      if (err) {
        console.error('Google OAuth error:', err);
        const errorMsg = encodeURIComponent('Authentication error. Please try again.');
        return res.redirect(`${frontendUrl}/signin?error=${errorMsg}`);
      }

      // Handle authentication failure (user not found, inactive, etc.)
      if (!user) {
        const errorMsg = encodeURIComponent(
          info?.message || 'Google sign-in failed. Please try again.'
        );
        return res.redirect(`${frontendUrl}/signin?error=${errorMsg}`);
      }

      // Success - attach user to request and proceed to controller
      req.user = user;
      next();
    })(req, res, next);
  },
  authController.googleCallback
);

// Exchange one-time OAuth code for tokens (public, short-TTL)
router.get('/google/exchange', authController.exchangeOAuthCode);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
