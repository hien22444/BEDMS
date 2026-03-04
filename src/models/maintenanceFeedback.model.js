const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const MaintenanceFeedbackSchema = new mongoose.Schema({
  request: {
    type: mongoose.Types.ObjectId,
    required: true,
    unique: true,
    ref: DBCollections.MAINTENANCE_REQUEST,
  },
  student: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.STUDENT,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  completion_status: {
    type: String,
    required: true,
    enum: ["completed", "incomplete", "needs_rework"],
  },
  comments: {
    type: String,
  },
  after_images_urls: {
    type: [String],
  },
  submitted_at: {
    type: Date,
    default: Date.now,
  },
});

MaintenanceFeedbackSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const MaintenanceFeedback = mongoose.model(
  DBCollections.MAINTENANCE_FEEDBACK,
  MaintenanceFeedbackSchema
);

module.exports = MaintenanceFeedback;
