/**
 * Seed script to move dormitory rules into MongoDB.
 * Run: npm run seed:dorm-rules
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { SystemConfig } = require('../models');

const CONFIG_KEY = 'dorm_rules_kb';

const dormRulesKb = {
  knowledge_base: {
    source: 'FPT University Dormitory Regulations - Hoa Hai Campus',
    issued_date: '2021-09-15',
    language: 'vi',
    version: '1.0',
  },
  rules: [
    {
      id: 'KTX-OPENING-HOURS',
      category: 'general',
      title: 'Dormitory opening hours',
      rule: 'Dormitory gates are open from 05:30 to 22:00.',
      details: 'Students should return before 22:00 unless approved by dorm management.',
      keywords: ['curfew', 'closing time', 'opening hours', 'late entry', 'gate closing'],
      example_questions: [
        'What time does the dorm close?',
        'Can I come back after 10PM?',
        'What is the curfew for the dorm?',
      ],
      penalty: {
        fine_vnd: 100000,
        description: 'Entering after curfew without valid reason.',
      },
    },
    {
      id: 'KTX-GUEST-POLICY',
      category: 'general',
      title: 'Guest policy',
      rule: 'Guests must present identification at the security desk.',
      details: 'Guests are not allowed to stay in the dorm after 22:00.',
      keywords: ['guest', 'visitor', 'friend visit', 'bring friend', 'overnight guest'],
      example_questions: [
        'Can my friend visit me in the dorm?',
        'Can someone stay overnight?',
        'What are the guest rules?',
      ],
      penalty: {
        fine_vnd: 1000000,
        description: 'Allowing unauthorized outsiders to stay in dorm.',
      },
    },
    {
      id: 'KTX-COOKING',
      category: 'living_rules',
      title: 'Cooking in dorm rooms',
      rule: 'Cooking in dorm rooms is strictly prohibited.',
      details: 'Students cannot bring cooking equipment such as stoves or hot plates.',
      keywords: ['cook', 'cooking', 'stove', 'hot pot', 'food preparation'],
      example_questions: [
        'Can I cook in my dorm room?',
        'Is hotpot allowed in the dorm?',
        'Can I use a stove in my room?',
      ],
      penalty: {
        fine_vnd: 500000,
        description: 'First violation results in administrative fine.',
      },
    },
    {
      id: 'KTX-SMOKING-ALCOHOL',
      category: 'living_rules',
      title: 'Smoking, alcohol, and substances',
      rule: 'Smoking, alcohol, and tobacco products including e-cigarettes are prohibited in the dormitory.',
      details: 'Drugs or narcotics are strictly forbidden and will be handled according to the law.',
      keywords: ['smoking', 'cigarette', 'vape', 'alcohol', 'beer', 'drug'],
      example_questions: [
        'Can I smoke in the dorm?',
        'Is alcohol allowed in the dorm?',
        'Are e-cigarettes allowed?',
      ],
      penalty: {
        fine_vnd: 500000,
        repeat_penalty: 'Dormitory service termination',
      },
    },
    {
      id: 'KTX-PETS',
      category: 'living_rules',
      title: 'Keeping pets',
      rule: 'Students are not allowed to keep animals or pets in the dormitory.',
      keywords: ['pet', 'dog', 'cat', 'animal'],
      example_questions: ['Can I keep a cat in my dorm?', 'Are pets allowed in the dorm?'],
      penalty: {
        fine_vnd: 500000,
      },
    },
    {
      id: 'KTX-NOISE',
      category: 'security',
      title: 'Noise and disturbance',
      rule: 'Students must not make loud noise or disturb other residents.',
      keywords: ['noise', 'party', 'loud music', 'disturbance'],
      example_questions: ['Can we have a party in the dorm?', 'Is loud music allowed?'],
      penalty: {
        fine_vnd: 200000,
      },
    },
    {
      id: 'KTX-ROOM-CHANGE',
      category: 'room_management',
      title: 'Changing rooms',
      rule: 'Students are not allowed to change rooms without permission from dorm management.',
      keywords: ['change room', 'switch room', 'move bed', 'swap room'],
      example_questions: ['Can I change my dorm room?', 'Can I swap rooms with a friend?'],
      penalty: {
        fine_vnd: 1000000,
      },
    },
    {
      id: 'KTX-ALLOWED-DEVICES',
      category: 'equipment',
      title: 'Allowed electrical devices',
      rule: 'Students may bring certain electrical devices to dorm rooms.',
      allowed_devices: ['fan', 'iron', 'electric kettle', 'study lamp', 'refrigerator under 110L'],
      keywords: ['electronics', 'devices', 'allowed appliances'],
      example_questions: ['What electrical devices can I bring?', 'Can I bring a refrigerator?'],
    },
    {
      id: 'KTX-FIRE-SAFETY',
      category: 'safety',
      title: 'Fire safety',
      rule: 'Flammable materials such as gasoline, gas cylinders, or explosives are prohibited.',
      keywords: ['fire safety', 'flammable', 'gas', 'fuel'],
      example_questions: [
        'Can I bring gas into the dorm?',
        'What items are banned for fire safety?',
      ],
      penalty: {
        fine_vnd: 500000,
      },
    },
  ],
  system_instructions: {
    assistant_role: 'Dormitory assistant for FPT University students.',
    response_rules: [
      'Use only the knowledge base rules.',
      'If a rule is violated, explain the penalty.',
      'If information is missing, say you do not know.',
    ],
  },
};

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
