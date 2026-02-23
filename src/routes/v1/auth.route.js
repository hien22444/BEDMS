const express = require('express');
const passport = require('passport');
const { authController } = require('../../controllers');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Public routes
router.post('/login', authController.login);

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
        const errorMsg = encodeURIComponent('An error occurred during authentication. Please try again.');
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

// Protected routes
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
