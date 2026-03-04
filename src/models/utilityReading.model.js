const mongoose = require("mongoose");
const { DBCollections } = require("../utils/constant");

const UtilityReadingSchema = new mongoose.Schema({
  room: {
    type: mongoose.Types.ObjectId,
    required: true,
    ref: DBCollections.ROOM,
  },
  reading_month: {
    type: String,
    required: true,
  },
  electricity_old_reading: {
    type: Number,
    required: true,
  },
  electricity_new_reading: {
    type: Number,
    required: true,
  },
  electricity_consumption: {
    type: Number,
  },
  water_old_reading: {
    type: Number,
    required: true,
  },
  water_new_reading: {
    type: Number,
    required: true,
  },
  water_consumption: {
    type: Number,
  },
  recorded_by: {
    type: mongoose.Types.ObjectId,
    ref: DBCollections.STAFF,
    default: null,
  },
  recorded_at: {
    type: Date,
    default: Date.now,
  },
});

UtilityReadingSchema.index({ room: 1, reading_month: 1 }, { unique: true });

UtilityReadingSchema.pre("save", function (next) {
  this.electricity_consumption =
    this.electricity_new_reading - this.electricity_old_reading;
  this.water_consumption = this.water_new_reading - this.water_old_reading;
  next();
});

UtilityReadingSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

const UtilityReading = mongoose.model(
  DBCollections.UTILITY_READING,
  UtilityReadingSchema
);

module.exports = UtilityReading;
