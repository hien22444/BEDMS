/**
 * Seed script to add specific user account
 * Run: node src/seeds/addUser.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { User, Student } = require("../models");

// User to add
const userData = {
  email: "tunggod24@gmail.com",
  password_hash: "Student@123",
  role: "student",
  fullname: "Tung Student",
  is_active: true,
};

const addUser = async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email });

    if (existingUser) {
      console.log(`⚠️  User ${userData.email} already exists!`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Active: ${existingUser.is_active}`);
      console.log("\n   You can login with this account.");
    } else {
      // Create User
      const user = await User.create(userData);
      console.log("✅ User created successfully!");
      console.log("\n" + "=".repeat(50));
      console.log("📝 Account details:");
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: Admin@123`);
      console.log(`   Role: ${user.role}`);
      console.log("=".repeat(50));
    }

  } catch (error) {
    console.error("❌ Failed:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
};

addUser();
