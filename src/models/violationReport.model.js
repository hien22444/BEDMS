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
      required: false,
      ref: DBCollections.STUDENT,
      default: null,
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
    /** Code of the reporter: student_code (student) or staff_code (manager/security). Filled on create or by enrich. */
    reporter_code: {
      type: String,
      required: false,
      default: null,
    },
    // Type of violation, aligned with student + manager UIs
    violation_type: {
      type: String,
      required: true,
      enum: ["noise", "cleanliness", "guest", "alcohol", "other"],
    },
    // When violation_type === "other", reporter must specify details here
    violation_other_detail: {
      type: String,
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
