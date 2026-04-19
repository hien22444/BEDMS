const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    recipient_count: { type: Number, required: true },
    recipients_preview: [{ type: String }],
    filters_used: {
      dorm_id: String,
      block_id: String,
      gender: String,
      student_type: String,
    },
    sent_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['sent', 'failed', 'partial'], default: 'sent' },
    error: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailLog', emailLogSchema);
