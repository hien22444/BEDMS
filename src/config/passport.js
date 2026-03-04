const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Student, Staff } = require("../models");

// Google OAuth Strategy
// Rule: User MUST be pre-registered (imported from Excel) before login
// No self-registration allowed
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value.toLowerCase();

        // Check if user exists in DB (MUST be pre-imported from Excel)
        const user = await User.findOne({ email });

        if (!user) {
          // User not found -> NOT ALLOWED to self-register
          return done(null, false, {
            message: "Account not yet authorized. Please contact the dormitory management.",
          });
        }

        // Check if user is active
        if (!user.is_active) {
          return done(null, false, {
            message: "Account is locked. Please contact the dormitory management.",
          });
        }

        // Link Google ID if not set (first time Google login)
        if (!user.google_id) {
          user.google_id = profile.id;
        }

        // Update fullname from Google profile if empty
        if (!user.fullname && profile.displayName) {
          user.fullname = profile.displayName;
        }

        // Update last login
        user.last_login = new Date();
        await user.save();

        // Get profile based on role
        let userProfile = null;
        if (user.role === "student") {
          userProfile = await Student.findOne({ user: user._id });
        } else if (["manager", "security"].includes(user.role)) {
          userProfile = await Staff.findOne({ user: user._id });
        }

        return done(null, { user, profile: userProfile });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Serialize user for session (not using session, but required by passport)
passport.serializeUser((data, done) => {
  done(null, data.user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;