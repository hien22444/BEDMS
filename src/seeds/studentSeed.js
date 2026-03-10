/**
 * Seed script to create 2 Student accounts for testing
 * Run: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, Student } = require('../models');

// Student data to seed
const studentsData = [
  {
    user: {
      email: 'se170001@fpt.edu.vn',
      password_hash: 'Student@123',
      role: 'student',
      is_active: true,
    },
    student: {
      student_code: 'SE170001',
      full_name: 'Nguyễn Văn An',
      date_of_birth: new Date('2003-05-15'),
      gender: 'male',
      phone: '0901234567',
      citizen_id: '001203012345',
      permanent_address: '123 Nguyễn Văn Linh, Quận 7, TP.HCM',
      major: 'Software Engineering',
      cohort: 'K17',
      behavioral_score: 10.0,
      violations_current_semester: 0,
      is_banned_permanently: false,
    },
  },
  {
    user: {
      email: 'se170002@fpt.edu.vn',
      password_hash: 'Student@123',
      role: 'student',
      is_active: true,
    },
    student: {
      student_code: 'SE170002',
      full_name: 'Trần Thị Bình',
      date_of_birth: new Date('2003-08-20'),
      gender: 'female',
      phone: '0907654321',
      citizen_id: '001203054321',
      permanent_address: '456 Lê Văn Việt, Quận 9, TP.HCM',
      major: 'Software Engineering',
      cohort: 'K17',
      behavioral_score: 10.0,
      violations_current_semester: 0,
      is_banned_permanently: false,
    },
  },
];

const seedStudents = async () => {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Drop old username index if exists (from old schema)
    try {
      await mongoose.connection.collection('users').dropIndex('username_1');
      console.log('🗑️  Dropped old username index');
    } catch (_) {
      // Index might not exist, ignore
    }

    console.log('\n📋 Seeding 2 Student accounts...\n');

    for (const data of studentsData) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: data.user.email });

      if (existingUser) {
        console.log(`⚠️  User ${data.user.email} already exists, skipping...`);
        continue;
      }

      // Create User
      const user = await User.create(data.user);
      console.log(`✅ Created User: ${user.email}`);

      // Check if student already exists
      const existingStudent = await Student.findOne({
        student_code: data.student.student_code,
      });

      if (existingStudent) {
        console.log(`⚠️  Student ${data.student.student_code} already exists, skipping...`);
        continue;
      }

      // Create Student profile linked to User
      const student = await Student.create({
        ...data.student,
        user: user._id,
      });
      console.log(`✅ Created Student: ${student.full_name} (${student.student_code})`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Seed completed successfully!');
    console.log('='.repeat(50));
    console.log('\n📝 Test accounts:');
    console.log('   Email: se170001@fpt.edu.vn');
    console.log('   Password: Student@123');
    console.log('');
    console.log('   Email: se170002@fpt.edu.vn');
    console.log('   Password: Student@123');
    console.log('='.repeat(50) + '\n');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run seed
seedStudents();
