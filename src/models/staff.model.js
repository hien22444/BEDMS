const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const StaffSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      required: true,
      unique: true,
      ref: DBCollections.USER,
    },
    staff_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    full_name: {
      type: String,
      required: true,
    },
    date_of_birth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    phone: {
      type: String,
    },
    position: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

StaffSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Staff = mongoose.model(DBCollections.STAFF, StaffSchema);

module.exports = Staff;
