const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const ViolationReportSchema = new mongoose.Schema(
  {
    report_code: {
      type: String,
      required: true,
      unique: true,
    },
    reported_student: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.STUDENT,
    },
    reporter: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.USER,
    },
    reporter_type: {
      type: String,
      required: true,
      enum: ["student", "security", "manager"],
    },
    violation_type: {
      type: String,
      required: true,
      enum: ["policy_violation", "other"],
    },
    description: {
      type: String,
      required: true,
    },
    evidence_urls: {
      type: [String],
    },
    violation_date: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
    },
    status: {
      type: String,
      default: "new",
      enum: [
        "new",
        "under_review",
        "resolved_penalized",
        "resolved_no_action",
        "rejected",
      ],
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    reviewed_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STAFF,
      default: null,
    },
    review_notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

ViolationReportSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const ViolationReport = mongoose.model(
  DBCollections.VIOLATION_REPORT,
  ViolationReportSchema
);

module.exports = ViolationReport;
