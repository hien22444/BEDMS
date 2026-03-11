/**
 * Seed script to create sample users for Google OAuth login
 * Run: node src/seeds/seedUsers.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../models/user.model');
const Student = require('../models/student.model');
const Staff = require('../models/staff.model');

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Create Student User (FPT email)
    const studentUser = await User.findOneAndUpdate(
      { email: 'hienttde180775@fpt.edu.vn' },
      {
        email: 'hienttde180775@fpt.edu.vn',
        fullname: 'Trần Trịnh Hiền',
        role: 'student',
        is_active: true,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated student user:', studentUser.email);

    // Create Student profile
    await Student.findOneAndUpdate(
      { user: studentUser._id },
      {
        user: studentUser._id,
        student_code: 'DE180775',
        full_name: 'Trần Trịnh Hiền',
        date_of_birth: new Date('2003-05-19'),
        gender: 'male',
        phone: '0123456789',
        citizen_id: '001234567890',
        permanent_address: 'Hà Nội, Việt Nam',
        major: 'Software Engineering',
        cohort: 'K18',
        behavioral_score: 10.0,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated student profile');

    // 2. Create Test Student (random email - không tồn tại thực)
    const testStudent = await User.findOneAndUpdate(
      { email: 'teststudent001@fpt.edu.vn' },
      {
        email: 'teststudent001@fpt.edu.vn',
        fullname: 'Nguyễn Văn Test',
        role: 'student',
        is_active: true,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated test student:', testStudent.email);

    await Student.findOneAndUpdate(
      { user: testStudent._id },
      {
        user: testStudent._id,
        student_code: 'DE999999',
        full_name: 'Nguyễn Văn Test',
        date_of_birth: new Date('2002-01-15'),
        gender: 'male',
        phone: '0999888777',
        citizen_id: '099988877766',
        permanent_address: 'TP.HCM, Việt Nam',
        major: 'Information Technology',
        cohort: 'K17',
        behavioral_score: 8.5,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated test student profile');

    // 3. Create Student with Gmail
    const gmailStudent = await User.findOneAndUpdate(
      { email: 'de180775trantrinhhien@gmail.com' },
      {
        email: 'de180775trantrinhhien@gmail.com',
        fullname: 'Trần Trịnh Hiền',
        role: 'student',
        is_active: true,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated gmail student:', gmailStudent.email);

    await Student.findOneAndUpdate(
      { user: gmailStudent._id },
      {
        user: gmailStudent._id,
        student_code: 'DE180775B',
        full_name: 'Trần Trịnh Hiền',
        date_of_birth: new Date('2003-05-19'),
        gender: 'male',
        phone: '0123456788',
        citizen_id: '001234567891',
        permanent_address: 'Hà Nội, Việt Nam',
        major: 'Software Engineering',
        cohort: 'K18',
        behavioral_score: 10.0,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated gmail student profile');

    // 4. Create Manager User (Gmail)
    const managerUser = await User.findOneAndUpdate(
      { email: 'trantrinhhien1905@gmail.com' },
      {
        email: 'trantrinhhien1905@gmail.com',
        fullname: 'Trần Trịnh Hiền (Manager)',
        role: 'manager',
        is_active: true,
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated manager user:', managerUser.email);

    // Create Staff profile for manager
    await Staff.findOneAndUpdate(
      { user: managerUser._id },
      {
        user: managerUser._id,
        staff_code: 'MGR001',
        full_name: 'Trần Trịnh Hiền',
        phone: '0987654321',
        position: 'Quản lý KTX',
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated staff profile');

    console.log('\n🎉 Seed completed successfully!');
    console.log('\nYou can now login with:');
    console.log('  - hienttde180775@fpt.edu.vn (Student)');
    console.log('  - teststudent001@fpt.edu.vn (Test Student - email khong ton tai)');
    console.log('  - de180775trantrinhhien@gmail.com (Student - Gmail)');
    console.log('  - trantrinhhien1905@gmail.com (Manager)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seedUsers();
