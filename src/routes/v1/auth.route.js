const express = require("express");
const passport = require("passport");
const { authController } = require("../../controllers");
const { authenticate } = require("../../middleware/auth");

const router = express.Router();

// Public routes
router.post("/login", authController.login);
router.post("/register", authController.register);

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/signin?error=google_auth_failed`,
  }),
  authController.googleCallback
);

// Protected routes
router.get("/profile", authenticate, authController.getProfile);

module.exports = router;
