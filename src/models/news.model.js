const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const NewsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    thumbnail_url: {
      type: String,
    },
    category: {
      type: String,
      required: true,
      enum: ['announcement', 'event', 'policy', 'maintenance', 'general'],
    },
    is_published: {
      type: Boolean,
      default: false,
    },
    published_at: {
      type: Date,
      default: null,
    },
    created_by: {
      type: mongoose.Types.ObjectId,
      ref: DBCollections.STAFF,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

NewsSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const News = mongoose.model(DBCollections.NEWS, NewsSchema);

module.exports = News;
