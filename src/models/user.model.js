const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DBCollections } = require('../utils/constant');

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password_hash: {
      type: String,
      required: false, // Not required for OAuth users
    },
    google_id: {
      type: String,
      default: null,
    },
    fullname: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      required: true,
      enum: ['student', 'manager', 'security', 'admin'],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    last_login: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.password_hash;
  },
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password_hash);
};

const User = mongoose.model(DBCollections.USER, UserSchema);

module.exports = User;
