const mongoose = require('mongoose');
const {
  User, Student, Room, BookingRequest, Invoice, EmailTemplate, EmailLog,
} = require('../models');
const { sendMail } = require('./email.service');
const AppError = require('../utils/AppError');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PREVIEW_LIMIT = 500;

const buildStudentPipeline = (filters = {}) => {
  const {
    dorm_id, block_id, gender, student_type,
    student_code_prefix, room_type, semester,
    invoice_status, behavioral_score_max,
  } = filters;

  const needsBooking = !!(dorm_id || block_id || room_type || semester);
  const pipeline = [];

  if (needsBooking) {
    pipeline.push(
      { $match: { status: 'approved' } },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      { $lookup: { from: 'users', localField: 'student.user', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.is_active': true, 'user.role': 'student' } }
    );

    if (semester) pipeline.push({ $match: { semester } });

    if (dorm_id || block_id || room_type) {
      pipeline.push(
        { $lookup: { from: 'beds', localField: 'bed', foreignField: '_id', as: 'bed' } },
        { $unwind: { path: '$bed', preserveNullAndEmptyArrays: false } },
        { $lookup: { from: 'rooms', localField: 'bed.room', foreignField: '_id', as: 'room' } },
        { $unwind: { path: '$room', preserveNullAndEmptyArrays: false } }
      );
      if (room_type) pipeline.push({ $match: { 'room.room_type': room_type } });
      if (dorm_id || block_id) {
        pipeline.push(
          { $lookup: { from: 'blocks', localField: 'room.block', foreignField: '_id', as: 'block' } },
          { $unwind: { path: '$block', preserveNullAndEmptyArrays: false } }
        );
        if (dorm_id) pipeline.push({ $match: { 'block.dorm': new mongoose.Types.ObjectId(dorm_id) } });
        if (block_id) pipeline.push({ $match: { 'block._id': new mongoose.Types.ObjectId(block_id) } });
      }
    }
  } else {
    pipeline.push(
      { $match: { role: 'student', is_active: true } },
      { $lookup: { from: 'students', localField: '_id', foreignField: 'user', as: 'student' } },
      { $unwind: '$student' },
      {
        $project: {
          _id: 0,
          user: { _id: '$_id', email: '$email', fullname: '$fullname' },
          student: '$student',
        },
      }
    );
  }

  if (gender) pipeline.push({ $match: { 'student.gender': gender } });
  if (student_type) pipeline.push({ $match: { 'student.student_type': student_type } });
  if (student_code_prefix) {
    pipeline.push({
      $match: {
        'student.student_code': {
          $regex: `^${escapeRegex(student_code_prefix)}`, $options: 'i',
        },
      },
    });
  }
  if (behavioral_score_max !== undefined && behavioral_score_max !== null && behavioral_score_max !== '') {
    const n = Number(behavioral_score_max);
    if (!Number.isNaN(n)) {
      pipeline.push({ $match: { 'student.behavioral_score': { $lte: n } } });
    }
  }

  if (invoice_status) {
    pipeline.push(
      {
        $lookup: {
          from: 'invoices',
          localField: 'student._id',
          foreignField: 'student',
          as: 'invoices',
        },
      },
      { $match: { 'invoices.payment_status': invoice_status } }
    );
  }

  pipeline.push({
    $group: {
      _id: '$user._id',
      email: { $first: '$user.email' },
      full_name: { $first: '$student.full_name' },
      student_code: { $first: '$student.student_code' },
      behavioral_score: { $first: '$student.behavioral_score' },
    },
  });

  pipeline.push({ $match: { email: { $ne: null } } });
  pipeline.push({ $sort: { student_code: 1 } });

  return { pipeline, rootModel: needsBooking ? BookingRequest : User };
};

const getStudentsForFilters = async (filters = {}) => {
  const { pipeline, rootModel } = buildStudentPipeline(filters);
  const results = await rootModel.aggregate(pipeline);
  return { emails: results.map((r) => r.email), students: results };
};

const previewStudents = async (filters) => {
  const { emails, students } = await getStudentsForFilters(filters || {});
  return { count: emails.length, students: students.slice(0, PREVIEW_LIMIT) };
};

const sendCampaign = async ({ subject, body, filters, extra_emails, userId }) => {
  const { emails: filteredEmails } = await getStudentsForFilters(filters || {});
  const manualEmails = Array.isArray(extra_emails) ? extra_emails.filter(Boolean) : [];
  const emails = Array.from(new Set([...filteredEmails, ...manualEmails]
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean)));

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

const getFilterOptions = async () => {
  const [roomTypes, semesters] = await Promise.all([
    Room.distinct('room_type'),
    BookingRequest.distinct('semester', { status: 'approved' }),
  ]);
  return {
    room_types: roomTypes.filter(Boolean).sort(),
    semesters: semesters.filter(Boolean).sort(),
  };
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
  getFilterOptions,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getHistory,
};
