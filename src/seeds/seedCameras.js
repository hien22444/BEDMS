/**
 * Seed script to create default camera configurations
 * Run: node src/seeds/seedCameras.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const CameraConfig = require('../models/cameraConfig.model');

const seedCameras = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Camera 1: Check-in gate (uses built-in webcam)
    await CameraConfig.findOneAndUpdate(
      { camera_id: 'cam-checkin-01' },
      {
        camera_id: 'cam-checkin-01',
        name: 'Main Gate Check-In',
        location: 'Dormitory Main Entrance',
        type: 'checkin',
        source_type: 'webcam',
        source_url: '0',
        is_active: true,
        fps_target: 5,
        recognition_threshold: 0.6,
      },
      { upsert: true, new: true }
    );
    console.log('Created/Updated check-in camera: cam-checkin-01');

    // Camera 2: Check-out gate (shares same webcam for prototyping)
    await CameraConfig.findOneAndUpdate(
      { camera_id: 'cam-checkout-01' },
      {
        camera_id: 'cam-checkout-01',
        name: 'Main Gate Check-Out',
        location: 'Dormitory Main Entrance',
        type: 'checkout',
        source_type: 'webcam',
        source_url: '0',
        is_active: true,
        fps_target: 5,
        recognition_threshold: 0.6,
      },
      { upsert: true, new: true }
    );
    console.log('Created/Updated check-out camera: cam-checkout-01');

    console.log('\nSeed completed successfully!');
    console.log('\nCamera configs:');
    console.log('  - cam-checkin-01: Main Gate Check-In (webcam 0)');
    console.log('  - cam-checkout-01: Main Gate Check-Out (webcam 0)');
    console.log('\nBoth cameras share the built-in webcam for prototyping.');
    console.log('Change source_type to "rtsp" and update source_url when DVR is on the network.');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seedCameras();
