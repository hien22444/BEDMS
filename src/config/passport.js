const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Student } = require("../models");

// Google OAuth Strategy
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

        // Validate FPT email domain
        if (!email.endsWith("@fpt.edu.vn")) {
          return done(null, false, {
            message: "Chỉ chấp nhận email @fpt.edu.vn",
          });
        }

        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
          // User exists, update google_id if not set
          if (!user.google_id) {
            user.google_id = profile.id;
            await user.save();
          }
          user.last_login = new Date();
          await user.save();
        } else {
          // Create new user from Google profile
          const fullName = profile.displayName || `${profile.name.givenName} ${profile.name.familyName}`;

          user = new User({
            email: email,
            fullname: fullName,
            role: "student",
            google_id: profile.id,
            is_active: true,
            last_login: new Date(),
          });
          await user.save();

          // Note: Student profile NOT created here
          // User must complete profile after first login
        }

        // Try to get student profile (may be null for new OAuth users)
        const studentProfile = await Student.findOne({ user: user._id });

        return done(null, { user, profile: studentProfile });
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
