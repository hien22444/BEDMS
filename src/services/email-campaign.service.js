const mongoose = require('mongoose');
const { User, BookingRequest, EmailTemplate, EmailLog } = require('../models');
const { sendMail } = require('./email.service');
const AppError = require('../utils/AppError');

const getStudentsForFilters = async ({ dorm_id, block_id, gender, student_type } = {}) => {
  const hasSpatialFilter = dorm_id || block_id;

  if (!hasSpatialFilter && !gender && !student_type) {
    const users = await User.find({ role: 'student', is_active: true }).select('email').lean();
    return { emails: users.map((u) => u.email).filter(Boolean), students: [] };
  }

  const pipeline = [
    { $match: { status: 'approved' } },
    {
      $lookup: {
        from: 'students', localField: 'student', foreignField: '_id', as: 'student',
      },
    },
    { $unwind: '$student' },
    {
      $lookup: {
        from: 'users', localField: 'student.user', foreignField: '_id', as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: { 'user.is_active': true } },
  ];

  if (gender) pipeline.push({ $match: { 'student.gender': gender } });
  if (student_type) pipeline.push({ $match: { 'student.student_type': student_type } });

  if (hasSpatialFilter) {
    pipeline.push(
      { $lookup: { from: 'beds', localField: 'bed', foreignField: '_id', as: 'bed' } },
      { $unwind: { path: '$bed', preserveNullAndEmptyArrays: false } },
      { $lookup: { from: 'rooms', localField: 'bed.room', foreignField: '_id', as: 'room' } },
      { $unwind: { path: '$room', preserveNullAndEmptyArrays: false } },
      { $lookup: { from: 'blocks', localField: 'room.block', foreignField: '_id', as: 'block' } },
      { $unwind: { path: '$block', preserveNullAndEmptyArrays: false } }
    );
    if (dorm_id) {
      pipeline.push({ $match: { 'block.dorm': new mongoose.Types.ObjectId(dorm_id) } });
    }
    if (block_id) {
      pipeline.push({ $match: { 'block._id': new mongoose.Types.ObjectId(block_id) } });
    }
  }

  pipeline.push({
    $group: {
      _id: '$user._id',
      email: { $first: '$user.email' },
      full_name: { $first: '$student.full_name' },
      student_code: { $first: '$student.student_code' },
    },
  });

  const results = await BookingRequest.aggregate(pipeline);
  const students = results.filter((r) => r.email);
  return { emails: students.map((s) => s.email), students };
};

const previewStudents = async (filters) => {
  const { emails, students } = await getStudentsForFilters(filters);
  return { count: emails.length, students: students.slice(0, 20) };
};

const sendCampaign = async ({ subject, body, filters, userId }) => {
  const { emails } = await getStudentsForFilters(filters || {});
  if (!emails.length) throw new AppError('No matching students found', 404);

  let status = 'sent';
  let error;
  try {
    await sendMail({ to: emails.join(','), subject, html: body });
  } catch (err) {
    status = 'failed';
    error = err.message;
    throw err;
  } finally {
    await EmailLog.create({
      subject,
      recipient_count: emails.length,
      recipients_preview: emails.slice(0, 10),
      filters_used: filters || {},
      sent_by: userId,
      status,
      error,
    });
  }

  return { sent: true, count: emails.length };
};

const listTemplates = () => EmailTemplate.find().sort({ updatedAt: -1 }).lean();

const createTemplate = ({ name, subject, body, userId }) =>
  EmailTemplate.create({ name, subject, body, created_by: userId });

const updateTemplate = async (id, { name, subject, body }) => {
  const t = await EmailTemplate.findByIdAndUpdate(
    id, { name, subject, body }, { new: true, runValidators: true }
  );
  if (!t) throw new AppError('Template not found', 404);
  return t;
};

const deleteTemplate = async (id) => {
  const t = await EmailTemplate.findByIdAndDelete(id);
  if (!t) throw new AppError('Template not found', 404);
};

const getHistory = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    EmailLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sent_by', 'email fullname')
      .lean(),
    EmailLog.countDocuments(),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = {
  previewStudents,
  sendCampaign,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getHistory,
};
