/**
 * Seed script to move dormitory rules into MongoDB.
 * Run: npm run seed:dorm-rules
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { SystemConfig } = require('../models');
const dormRulesKb = require('./dormRulesKnowledgeBase');

const CONFIG_KEY = 'dorm_rules_kb';

const seedDormRules = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    await SystemConfig.findOneAndUpdate(
      { config_key: CONFIG_KEY },
      {
        config_key: CONFIG_KEY,
        config_value: JSON.stringify(dormRulesKb),
        description: 'Dormitory rules knowledge base for the assistant',
        value_type: 'json',
        updated_at: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log('Dormitory rules knowledge base upserted successfully.');
  } catch (error) {
    console.error('Dormitory rules seed failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

seedDormRules();
