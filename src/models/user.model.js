const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { DBCollections } = require("../utils/constant");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  created_at: {
    type: Date,
    default() {
      return new Date();
    },
  },
  updated_at: {
    type: Date,
    default() {
      return new Date();
    },
  },
});

UserSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.password;
  },
});

UserSchema.virtual("totalOrder", {
  ref: DBCollections.ORDER,
  localField: "_id",
  foreignField: "user",
  count: true,
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model(DBCollections.USER, UserSchema);

module.exports = User;
