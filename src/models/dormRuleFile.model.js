const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const DormRuleFileSchema = new mongoose.Schema(
  {
    original_name: {
      type: String,
      required: true,
      trim: true,
    },
    file_extension: {
      type: String,
      required: true,
      trim: true,
    },
    file_url: {
      type: String,
      required: true,
      trim: true,
    },
    cloudinary_public_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    mime_type: {
      type: String,
      required: true,
      trim: true,
    },
    file_size: {
      type: Number,
      required: true,
      min: 0,
    },
    is_featured: {
      type: Boolean,
      default: false,
    },
    uploaded_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.USER,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

DormRuleFileSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const DormRuleFile = mongoose.model(DBCollections.DORM_RULE_FILE, DormRuleFileSchema);

module.exports = DormRuleFile;
