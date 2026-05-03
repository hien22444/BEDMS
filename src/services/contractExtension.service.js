const {
  ContractExtension,
  Contract,
  Student,
  Staff,
  Invoice,
  User,
  Notification,
} = require('../models');
const AppError = require('../utils/AppError');

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Generate unique extension invoice code */
const generateInvoiceCode = async (maxRetries = 3) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `EXT-INV-${dateStr}-`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const last = await Invoice.findOne({
      invoice_code: { $regex: `^${prefix}` },
    }).sort({ invoice_code: -1 });

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.invoice_code.split('-').pop(), 10);
      seq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
    }

    const code = `${prefix}${String(seq).padStart(4, '0')}`;
    const exists = await Invoice.findOne({ invoice_code: code });
    if (!exists) return code;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
};

const resolveStudent = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError('Only registered students can request contract extensions.', 403);
  return student;
};

const populateExtension = (query) =>
  query
    .populate({ path: 'student', select: 'full_name student_code', populate: { path: 'user', select: 'email' } })
    .populate({ path: 'contract', select: 'semester start_date end_date room_price status', populate: { path: 'room', select: 'room_number room_type block', populate: { path: 'block', select: 'block_name block_code', populate: { path: 'dorm', select: 'dorm_name' } } } })
    .populate({ path: 'reviewed_by', select: 'full_name staff_code' });

const notifyManagers = async (title, message, relatedId) => {
  const managers = await User.find({ role: 'manager', is_active: true }).select('_id').lean();
  if (!managers.length) return;
  await Notification.insertMany(
    managers.map((m) => ({
      user: m._id,
      title,
      message,
      notification_type: 'info',
      category: 'general',
      related_id: relatedId.toString(),
    }))
  );
};

const notifyStudent = async (studentId, title, message, type, relatedId) => {
  const student = await Student.findById(studentId).select('user').lean();
  if (!student?.user) return;
  await Notification.create({
    user: student.user,
    title,
    message,
    notification_type: type,
    category: 'general',
    related_id: relatedId.toString(),
  });
};

// ─── student actions ──────────────────────────────────────────────────────────

/**
 * Student gửi yêu cầu gia hạn hợp đồng.
 * Body: { extension_months: number }
 */
const createExtensionRequest = async (userId, body) => {
  const student = await resolveStudent(userId);

  const contract = await Contract.findOne({ student: student._id, status: 'active' })
    .populate({ path: 'room', select: 'room_price room_type' })
    .lean();
  if (!contract) throw new AppError('You do not have an active contract to extend.', 400);

  const extension_months = parseInt(body?.extension_months, 10);
  if (!extension_months || extension_months < 1 || extension_months > 6) {
    throw new AppError('extension_months must be between 1 and 6.', 400);
  }

  // Block nếu đã có request đang xử lý
  const existing = await ContractExtension.findOne({
    student: student._id,
    status: 'pending',
  }).lean();
  if (existing) {
    throw new AppError('You already have a pending extension request. Please wait for it to be reviewed.', 409);
  }

  const current_end = new Date(contract.end_date);
  const new_end_date = new Date(current_end);
  new_end_date.setMonth(new_end_date.getMonth() + extension_months);

  const monthly_price = contract.room_price / 4; // Estimate: 1 semester ≈ 4 months
  const additional_cost = Math.round(monthly_price * extension_months);

  const extension = await ContractExtension.create({
    contract: contract._id,
    student: student._id,
    new_end_date,
    extension_months,
    additional_cost,
    status: 'pending',
  });

  // Notify managers (non-blocking)
  notifyManagers(
    'New contract extension request',
    `Student ${student.full_name} (${student.student_code}) requested a ${extension_months}-month contract extension.`,
    extension._id
  ).catch((err) => console.error('[extension] notifyManagers failed:', err.message));

  const populated = await populateExtension(ContractExtension.findById(extension._id)).lean();
  return { ...populated, id: populated._id };
};

/** Student xem lịch sử yêu cầu gia hạn của mình */
const getMyExtensionRequests = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) return [];

  const list = await populateExtension(
    ContractExtension.find({ student: student._id }).sort({ requested_at: -1 })
  ).lean();

  return list.map((r) => ({ ...r, id: r._id }));
};

/** Student huỷ yêu cầu đang pending */
const cancelExtensionRequest = async (userId, extensionId) => {
  const student = await resolveStudent(userId);

  const ext = await ContractExtension.findOne({ _id: extensionId, student: student._id });
  if (!ext) throw new AppError('Extension request not found.', 404);
  if (ext.status !== 'pending') {
    throw new AppError('Only pending requests can be cancelled.', 409);
  }

  ext.status = 'rejected'; // Reuse rejected status for student-cancelled
  await ext.save();

  return { id: ext._id, status: ext.status };
};

// ─── manager actions ──────────────────────────────────────────────────────────

/** Manager xem tất cả yêu cầu gia hạn */
const getAllExtensionRequests = async (query = {}) => {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;

  const [items, total] = await Promise.all([
    populateExtension(
      ContractExtension.find(filter)
        .sort({ requested_at: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
    ).lean(),
    ContractExtension.countDocuments(filter),
  ]);

  return {
    data: items.map((i) => ({ ...i, id: i._id })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

/** Manager xem chi tiết 1 yêu cầu */
const getExtensionRequestById = async (extensionId) => {
  const ext = await populateExtension(ContractExtension.findById(extensionId)).lean();
  if (!ext) throw new AppError('Extension request not found.', 404);
  return { ...ext, id: ext._id };
};

/**
 * Manager duyệt hoặc từ chối yêu cầu gia hạn.
 * Body: { status: 'approved' | 'rejected', rejection_reason? }
 *
 * Khi approved:
 * - Extend contract.end_date → new_end_date
 * - Tạo Invoice cho khoản phí gia hạn
 * - Notify student
 */
const reviewExtensionRequest = async (extensionId, managerUserId, body) => {
  const ext = await ContractExtension.findById(extensionId);
  if (!ext) throw new AppError('Extension request not found.', 404);

  if (ext.status !== 'pending') {
    throw new AppError(`Cannot review a request with status "${ext.status}".`, 409);
  }

  const nextStatus = String(body?.status || '').trim();
  if (!['approved', 'rejected'].includes(nextStatus)) {
    throw new AppError('status must be "approved" or "rejected".', 400);
  }

  if (nextStatus === 'rejected') {
    const rejection_reason = String(body?.rejection_reason || '').trim();
    if (!rejection_reason) {
      throw new AppError('rejection_reason is required when rejecting.', 400);
    }
  }

  const staff = await Staff.findOne({ user: managerUserId }).select('_id full_name').lean();

  ext.status = nextStatus;
  ext.reviewed_at = new Date();
  ext.reviewed_by = staff?._id || null;
  await ext.save();

  let invoice = null;

  if (nextStatus === 'approved') {
    // ── Extend contract end_date ─────────────────────────────
    const contract = await Contract.findById(ext.contract);
    if (!contract) throw new AppError('Associated contract not found.', 404);

    contract.end_date = ext.new_end_date;
    contract.status = 'extended';
    await contract.save();

    // ── Create extension invoice ─────────────────────────────
    const invoice_code = await generateInvoiceCode();
    const due_date = new Date();
    due_date.setDate(due_date.getDate() + 7); // 7 days to pay

    invoice = await Invoice.create({
      invoice_code,
      student: ext.student,
      room: contract.room,
      invoice_month: `EXT-${ext.extension_months}M`,
      room_fee: ext.additional_cost,
      electricity_fee: 0,
      water_fee: 0,
      service_fee: 0,
      other_fees: 0,
      total_amount: ext.additional_cost,
      payment_status: 'unpaid',
      due_date,
      created_by: staff?._id || null,
    });
  }

  // Notify student (non-blocking)
  const isApproved = nextStatus === 'approved';
  notifyStudent(
    ext.student,
    isApproved ? 'Contract extension approved' : 'Contract extension rejected',
    isApproved
      ? `Your ${ext.extension_months}-month contract extension has been approved. An invoice of ${ext.additional_cost.toLocaleString('vi-VN')} VND has been created. Please pay within 7 days.`
      : `Your contract extension request was rejected.${body?.rejection_reason ? ` Reason: ${body.rejection_reason}` : ''}`,
    isApproved ? 'success' : 'warning',
    ext._id
  ).catch((err) => console.error('[extension] notifyStudent failed:', err.message));

  const populated = await populateExtension(ContractExtension.findById(ext._id)).lean();
  return { ...populated, id: populated._id, invoice: invoice ? { ...invoice.toJSON(), id: invoice._id } : null };
};

// ─── stats ────────────────────────────────────────────────────────────────────

/** Summary stats for dashboard */
const getExtensionStats = async () => {
  const [pending, approved, rejected] = await Promise.all([
    ContractExtension.countDocuments({ status: 'pending' }),
    ContractExtension.countDocuments({ status: 'approved' }),
    ContractExtension.countDocuments({ status: 'rejected' }),
  ]);
  return { pending, approved, rejected, total: pending + approved + rejected };
};

module.exports = {
  createExtensionRequest,
  getMyExtensionRequests,
  cancelExtensionRequest,
  getAllExtensionRequests,
  getExtensionRequestById,
  reviewExtensionRequest,
  getExtensionStats,
};
