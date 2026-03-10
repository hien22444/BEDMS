const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const StudentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      required: true,
      unique: true,
      ref: DBCollections.USER,
    },
    student_code: {
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
      enum: ['male', 'female', 'other'],
    },
    phone: {
      type: String,
    },
    citizen_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    permanent_address: {
      type: String,
    },
    avatar_url: {
      type: String,
    },
    major: {
      type: String,
    },
    cohort: {
      type: String,
    },
    student_type: {
      type: String,
      enum: ['domestic', 'international'],
    },
    behavioral_score: {
      type: Number,
      default: 10.0,
      min: 0,
      max: 10,
    },
    violations_current_semester: {
      type: Number,
      default: 0,
    },
    is_banned_permanently: {
      type: Boolean,
      default: false,
    },
    ban_until_semester: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

StudentSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const Student = mongoose.model(DBCollections.STUDENT, StudentSchema);

module.exports = Student;
