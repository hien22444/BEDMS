const mongoose = require('mongoose');
const { DBCollections } = require('../utils/constant');

const FaceEmbeddingSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Types.ObjectId,
      required: true,
      unique: true,
      ref: DBCollections.STUDENT,
    },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) => v.length === 512,
        message: 'Embedding must be 512 dimensions',
      },
    },
    face_image_url: {
      type: String,
    },
    registered_by: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: DBCollections.USER,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    quality_score: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

FaceEmbeddingSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.embedding; // Never expose raw embedding in JSON responses
  },
});

const FaceEmbedding = mongoose.model(
  DBCollections.FACE_EMBEDDING,
  FaceEmbeddingSchema
);

module.exports = FaceEmbedding;
