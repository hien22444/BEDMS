const AppError = require('../utils/AppError');
const {
  BookingRequest,
  Contract,
  Invoice,
  InvoiceLineItem,
  Notification,
  Payment,
  Room,
  Student,
  User,
} = require('../models');
const { createPayosPaymentLink, getPayosPaymentInfo } = require('./payos.service');
const { sendPaymentSuccessEmail } = require('./email.service');
const { createEWInvoices } = require('./ewUsage.service');
const {
  getStartOfTodayInDormTimezone,
  normalizeDateOnlyToDormNoonUtc,
} = require('../utils/dateOnly');

const EW_INVOICE_REGEX = /^EW-/;
const isSameAmount = (left, right) => Number(left || 0) === Number(right || 0);

const buildPayosPayload = (payment) => {
  if (!payment) return null;
  return {
    orderCode: payment.payos_order_code,
    paymentLinkId: payment.payos_payment_link_id,
    checkoutUrl: payment.payos_checkout_url,
    qrCode: payment.payos_qr_code,
    status: payment.payment_status,
  };
};

const buildInvoiceResponse = (invoice) => ({
  ...invoice.toJSON(),
  id: invoice._id,
});

const emitInvoiceRealtime = async (io, invoice, action = 'updated') => {
  if (!io || !invoice) return;
  const payload = {
    action,
    invoiceId: String(invoice._id || invoice.id),
    invoice_code: invoice.invoice_code,
    payment_status: invoice.payment_status,
    total_amount: invoice.total_amount,
    invoice_month: invoice.invoice_month,
    student: invoice.student ? String(invoice.student) : null,
    room: invoice.room ? String(invoice.room) : null,
  };

  io.to('managers').emit('invoice_updated', payload);
  if (invoice.student) {
    const student = await Student.findById(invoice.student).select('user').lean().catch(() => null);
    if (student?.user) {
      io.to(`user_${student.user}`).emit('invoice_updated', payload);
    }
  }
};

const emitInvoiceNotification = (io, userId, { title, message, relatedId, notificationType = 'info' }) => {
  if (!io || !userId) return;
  io.to(`user_${userId}`).emit('new_notification', {
    title,
    message,
    notification_type: notificationType,
    category: 'payment',
    related_id: relatedId ? String(relatedId) : undefined,
  });
};

const generateInvoiceOrderCode = () => Number(`2${Date.now()}${Math.floor(Math.random() * 10)}`);
const normalizeFrontendUrl = () => String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findStudentByCode = (studentCode) => {
  const code = String(studentCode || '').trim();
  if (!code) return null;
  return Student.findOne({
    student_code: { $regex: `^${escapeRegex(code)}$`, $options: 'i' },
  });
};
const isMissingPayosPaymentError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('code: 101') || message.includes('mã thanh toán không tồn tại');
};

const isPayosPaid = (info) => {
  const status = String(
    info?.status || info?.data?.status || info?.paymentStatus || ''
  ).toLowerCase();
  return status === 'paid' || status === 'success' || status === 'completed';
};

const findStudentByUserId = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError('Student profile not found', 404);
  return student;
};

const attachPaymentsToInvoices = async (invoices) => {
  if (!invoices.length) return new Map();

  const payments = await Payment.find({
    invoice: { $in: invoices.map((invoice) => invoice._id) },
    payment_method: 'payos',
  })
    .sort({ created_at: -1 })
    .lean();

  const paymentByInvoiceId = new Map();
  payments.forEach((payment) => {
    const invoiceId = payment.invoice.toString();
    if (!paymentByInvoiceId.has(invoiceId)) {
      paymentByInvoiceId.set(invoiceId, payment);
    }
  });

  return paymentByInvoiceId;
};

const formatInvoices = async (invoices) => {
  const invoiceIds = invoices.map((invoice) => invoice._id);
  const [lineItems, paymentByInvoiceId] = await Promise.all([
    invoiceIds.length ? InvoiceLineItem.find({ invoice: { $in: invoiceIds } }).lean() : [],
    attachPaymentsToInvoices(invoices),
  ]);

  return invoices.map((invoice) => ({
    ...invoice,
    id: invoice._id,
    line_items: lineItems.filter(
      (lineItem) => lineItem.invoice.toString() === invoice._id.toString()
    ),
    payos: buildPayosPayload(paymentByInvoiceId.get(invoice._id.toString()) || null),
  }));
};

const finalizeUtilityInvoicePayment = async (invoice, payment, payosInfo, io = null) => {
  if (!isSameAmount(payment.amount, invoice.total_amount)) {
    if (payment.payment_status === 'pending') {
      payment.payment_status = 'failed';
    }
    payment.transaction_details = {
      ...(payment.transaction_details || {}),
      payosInfo,
      amount_mismatch: {
        invoice_total_amount: invoice.total_amount,
        payment_amount: payment.amount,
      },
    };
    await payment.save();

    return {
      status: 'amount_mismatch',
      paid: false,
      message: 'Payment amount is outdated. Please create a new payment link.',
      invoice: buildInvoiceResponse(invoice),
      payos: buildPayosPayload(payment),
    };
  }

  if (payment.payment_status !== 'completed') {
    payment.payment_status = 'completed';
    payment.paid_at = new Date();
    payment.transaction_details = payosInfo;
    await payment.save();
  }

  if (invoice.payment_status !== 'paid') {
    invoice.payment_status = 'paid';
    invoice.paid_at = new Date();
    await invoice.save();
    emitInvoiceRealtime(io, invoice, 'paid');

    const student = await Student.findById(invoice.student).lean();
    if (student?.user) {
      await Notification.create({
        user: student.user,
        title: 'Payment Successful',
        message: `Your payment for ${invoice.invoice_code} was successful.`,
        notification_type: 'success',
        category: 'payment',
        related_id: invoice._id.toString(),
      });
      emitInvoiceNotification(io, student.user, {
        title: 'Payment Successful',
        message: `Your payment for ${invoice.invoice_code} was successful.`,
        relatedId: invoice._id,
        notificationType: 'success',
      });

      const user = await User.findById(student.user).lean();
      if (user?.email) {
        try {
          await sendPaymentSuccessEmail({
            to: user.email,
            studentName: student.full_name,
            invoiceCode: invoice.invoice_code,
            amountVnd: invoice.total_amount,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Email] sendPaymentSuccessEmail failed:', err.message);
        }
      }
    }
  }

  return {
    status: 'paid',
    paid: true,
    invoice: buildInvoiceResponse(invoice),
    payos: buildPayosPayload(payment),
  };
};

const getMyInvoices = async (userId) => {
  const student = await findStudentByUserId(userId);

  const invoices = await Invoice.find({ student: student._id })
    .populate('room', 'room_number')
    .sort({ createdAt: -1 })
    .lean();

  return formatInvoices(invoices);
};

const createPayosLinkForInvoice = async (invoiceId, userId) => {
  const student = await findStudentByUserId(userId);
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    student: student._id,
  });

  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.payment_status === 'paid') throw new AppError('Invoice is already paid', 400);
  if (invoice.payment_status === 'cancelled') throw new AppError('Invoice is cancelled', 400);
  if (invoice.total_amount <= 0) {
    throw new AppError('Invoice amount must be greater than zero', 400);
  }

  await Payment.updateMany(
    {
      invoice: invoice._id,
      payment_method: 'payos',
      payment_status: 'pending',
      amount: { $ne: invoice.total_amount },
    },
    {
      $set: {
        payment_status: 'expired',
      },
    }
  );

  let existingPayment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
    payment_status: 'pending',
    amount: invoice.total_amount,
  })
    .sort({ created_at: -1 })
    .lean();

  if (existingPayment?.payos_order_code) {
    try {
      const payosInfo = await getPayosPaymentInfo(existingPayment.payos_order_code);
      const payosStatus = String(payosInfo?.status || payosInfo?.data?.status || '').toLowerCase();
      if (['cancelled', 'canceled', 'expired'].includes(payosStatus)) {
        await Payment.findByIdAndDelete(existingPayment._id);
        existingPayment = null;
      }
    } catch (error) {
      if (isMissingPayosPaymentError(error)) {
        await Payment.findByIdAndDelete(existingPayment._id);
        existingPayment = null;
      } else {
        throw error;
      }
    }
  }

  if (existingPayment?.payos_checkout_url) {
    if (existingPayment.payos_order_code) {
      const payosInfo = await getPayosPaymentInfo(existingPayment.payos_order_code);
      const payosStatus = String(payosInfo?.status || payosInfo?.data?.status || '').toLowerCase();
      if (payosStatus === 'cancelled' || payosStatus === 'canceled') {
        // Link đã bị cancel trên PayOS — xóa record stale, tạo link mới bên dưới
        await Payment.findByIdAndDelete(existingPayment._id);
      } else {
        return {
          invoice: buildInvoiceResponse(invoice),
          payos: buildPayosPayload(existingPayment),
        };
      }
    } else {
      return {
        invoice: buildInvoiceResponse(invoice),
        payos: buildPayosPayload(existingPayment),
      };
    }
  }

  const frontendUrl = normalizeFrontendUrl();
  const returnUrl = `${frontendUrl}/student/utilities?payment=success&invoice=${invoice._id}`;
  const cancelUrl = `${frontendUrl}/student/utilities?payment=cancelled&invoice=${invoice._id}`;
  if (!returnUrl || !cancelUrl) {
    throw new AppError('PayOS return or cancel URL is not configured', 500);
  }

  const user = await User.findById(student.user).select('email full_name').lean();
  const orderCode = generateInvoiceOrderCode();
  const paymentLink = await createPayosPaymentLink({
    orderCode,
    amount: invoice.total_amount,
    description: invoice.invoice_code,
    returnUrl,
    cancelUrl,
    buyerEmail: user?.email,
    buyerName: user?.full_name || student.full_name,
    items: [
      {
        name: `Invoice ${invoice.invoice_code}`,
        quantity: 1,
        price: invoice.total_amount,
      },
    ],
  });

  const payosPaymentLinkId = paymentLink?.paymentLinkId || paymentLink?.id || null;
  const payosCheckoutUrl = paymentLink?.checkoutUrl || paymentLink?.checkout_url || null;
  const payosQrCode = paymentLink?.qrCode || paymentLink?.qr_code || null;

  const payment = await Payment.create({
    transaction_code: `INV-PAYOS-${orderCode}`,
    payos_order_code: orderCode,
    payos_payment_link_id: payosPaymentLinkId,
    payos_checkout_url: payosCheckoutUrl,
    payos_qr_code: payosQrCode,
    invoice: invoice._id,
    student: student._id,
    amount: invoice.total_amount,
    payment_method: 'payos',
    payment_status: 'pending',
    transaction_details: paymentLink || null,
  });

  return {
    invoice: buildInvoiceResponse(invoice),
    payos: buildPayosPayload(payment),
  };
};

const getInvoicePaymentStatus = async (invoiceId, userId, io = null) => {
  const student = await findStudentByUserId(userId);
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    student: student._id,
  });

  if (!invoice) throw new AppError('Invoice not found', 404);

  if (invoice.payment_status === 'paid') {
    return {
      status: 'paid',
      paid: true,
      invoice: buildInvoiceResponse(invoice),
    };
  }

  const payment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
    amount: invoice.total_amount,
  }).sort({ created_at: -1 });

  if (!payment) {
    const stalePayment = await Payment.findOne({
      invoice: invoice._id,
      payment_method: 'payos',
    }).sort({ created_at: -1 });

    if (stalePayment && !isSameAmount(stalePayment.amount, invoice.total_amount)) {
      return {
        status: 'amount_mismatch',
        paid: false,
        message: 'Previous payment link is outdated. Please create a new payment link.',
        invoice: buildInvoiceResponse(invoice),
        payos: null,
      };
    }
  }

  if (!payment?.payos_order_code) {
    return {
      status: 'pending',
      paid: false,
      message: 'Payment link has not been created yet',
      invoice: buildInvoiceResponse(invoice),
    };
  }

  let payosInfo;
  try {
    payosInfo = await getPayosPaymentInfo(payment.payos_order_code);
  } catch (error) {
    if (isMissingPayosPaymentError(error)) {
      await payment.deleteOne();
      return {
        status: 'stale_link',
        paid: false,
        message: 'Previous payment link is no longer valid. Please create a new payment link.',
        invoice: buildInvoiceResponse(invoice),
        payos: null,
      };
    }
    throw error;
  }
  const payosStatus = String(payosInfo?.status || payosInfo?.data?.status || '').toLowerCase();

  if (payosStatus === 'cancelled' || payosStatus === 'canceled') {
    if (payment.payment_status === 'pending') {
      await payment.deleteOne();
    }
    return {
      status: 'cancelled',
      paid: false,
      message: 'Payment was cancelled',
      invoice: buildInvoiceResponse(invoice),
      payos: null,
    };
  }

  if (!isPayosPaid(payosInfo)) {
    return {
      status: 'pending',
      paid: false,
      message: 'Payment not completed',
      invoice: buildInvoiceResponse(invoice),
      payos: buildPayosPayload(payment),
    };
  }

  return finalizeUtilityInvoicePayment(invoice, payment, payosInfo, io);
};

const handlePayosWebhook = async (webhookData, io) => {
  const data = webhookData?.data || webhookData;
  const orderCode = data?.orderCode || data?.order_code;
  const status = String(data?.status || data?.paymentStatus || '').toLowerCase();

  if (!orderCode) return { ok: true, ignored: true, reason: 'missing orderCode' };

  const payment = await Payment.findOne({ payos_order_code: Number(orderCode) });
  if (!payment) return { ok: true, ignored: true, reason: 'payment not found' };

  const booking = await BookingRequest.findOne({ invoice: payment.invoice }).lean();
  if (booking) {
    const bookingService = require('./booking.service');
    return bookingService.handlePayosWebhook(webhookData, io);
  }

  if (payment.payment_status === 'completed') {
    return { ok: true, ignored: true, reason: 'already completed' };
  }
  if (['cancelled', 'expired'].includes(payment.payment_status)) {
    return { ok: true, ignored: true, reason: 'already closed' };
  }

  const invoice = await Invoice.findById(payment.invoice);
  if (!invoice) return { ok: true, ignored: true, reason: 'invoice not found' };

  if (!isSameAmount(payment.amount, invoice.total_amount)) {
    payment.payment_status = 'failed';
    payment.transaction_details = {
      ...(payment.transaction_details || {}),
      webhookData,
      amount_mismatch: {
        invoice_total_amount: invoice.total_amount,
        payment_amount: payment.amount,
      },
    };
    await payment.save();
    return { ok: true, handled: true, status: 'amount_mismatch' };
  }

  if (status === 'cancelled' || status === 'canceled') {
    await payment.deleteOne();
    return { ok: true, handled: true, status: 'cancelled' };
  }

  if (status === 'paid' || status === 'success' || status === 'completed') {
    return finalizeUtilityInvoicePayment(invoice, payment, webhookData, io);
  }

  return { ok: true, ignored: true, status };
};

// ─── Manager APIs ─────────────────────────────────────────────────────────────

const generateInvoiceCode = (prefix = 'INV') =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const buildLineItems = (invoiceId, body) => {
  const items = [];
  if (body.room_fee > 0)
    items.push({ invoice: invoiceId, item_type: 'room_fee', description: 'Room fee', quantity: 1, unit_price: body.room_fee, amount: body.room_fee });
  if (body.electricity_fee > 0)
    items.push({ invoice: invoiceId, item_type: 'electricity', description: 'Electricity fee', quantity: 1, unit_price: body.electricity_fee, amount: body.electricity_fee });
  if (body.water_fee > 0)
    items.push({ invoice: invoiceId, item_type: 'water', description: 'Water fee', quantity: 1, unit_price: body.water_fee, amount: body.water_fee });
  if (body.service_fee > 0)
    items.push({ invoice: invoiceId, item_type: 'service', description: 'Service fee', quantity: 1, unit_price: body.service_fee, amount: body.service_fee });
  if (body.other_fees > 0)
    items.push({ invoice: invoiceId, item_type: 'other', description: body.other_fees_description || 'Other fees', quantity: 1, unit_price: body.other_fees, amount: body.other_fees });
  return items;
};

const getInvoices = async (query = {}) => {
  const { page = 1, limit = 10, payment_status, invoice_month, student_code, room_id, block_id } = query;
  const filter = {};

  // Manager list never shows cancelled invoices
  if (payment_status) {
    if (payment_status === 'overdue') {
      const todayStart = getStartOfTodayInDormTimezone();
      filter.payment_status = 'unpaid';
      filter.due_date = { $lt: todayStart };
    } else {
      filter.payment_status = payment_status;
    }
  } else {
    filter.payment_status = { $ne: 'cancelled' };
  }
  if (invoice_month) filter.invoice_month = { $regex: invoice_month, $options: 'i' };

  if (student_code) {
    const student = await findStudentByCode(student_code).lean();
    if (!student) return { data: [], total: 0, page: Number(page), totalPages: 0 };
    filter.student = student._id;
  }

  if (room_id) {
    filter.room = room_id;
  } else if (block_id) {
    const rooms = await Room.find({ block: block_id }, '_id').lean();
    filter.room = { $in: rooms.map((r) => r._id) };
  }

  const total = await Invoice.countDocuments(filter);
  const invoices = await Invoice.find(filter)
    .populate('student', 'full_name student_code')
    .populate({ path: 'room', select: 'room_number block', populate: { path: 'block', select: 'block_name block_code' } })
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const invoiceIds = invoices.map((inv) => inv._id);
  const lineItems = invoiceIds.length ? await InvoiceLineItem.find({ invoice: { $in: invoiceIds } }).lean() : [];

  return {
    data: invoices.map((inv) => ({
      ...inv,
      id: inv._id,
      line_items: lineItems.filter((li) => li.invoice.toString() === inv._id.toString()),
    })),
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

const getInvoiceDetail = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId)
    .populate('student', 'full_name student_code phone')
    .populate({ path: 'room', select: 'room_number block', populate: { path: 'block', select: 'block_name block_code' } })
    .lean();
  if (!invoice) throw new AppError('Invoice not found', 404);

  const lineItems = await InvoiceLineItem.find({ invoice: invoice._id }).lean();
  return { ...invoice, id: invoice._id, line_items: lineItems };
};

const createSingleInvoice = async ({ student, roomId, body, staffId, io = null }) => {
  const total =
    Number(body.room_fee || 0) +
    Number(body.electricity_fee || 0) +
    Number(body.water_fee || 0) +
    Number(body.service_fee || 0) +
    Number(body.other_fees || 0);
  const normalizedDueDate = normalizeDateOnlyToDormNoonUtc(body.due_date);

  if (Number.isNaN(normalizedDueDate.getTime())) {
    throw new AppError('due_date is invalid', 400);
  }

  const invoice = await Invoice.create({
    invoice_code: generateInvoiceCode(),
    student: student._id,
    room: roomId,
    invoice_month: body.invoice_month,
    room_fee: Number(body.room_fee || 0),
    electricity_fee: Number(body.electricity_fee || 0),
    water_fee: Number(body.water_fee || 0),
    service_fee: Number(body.service_fee || 0),
    other_fees: Number(body.other_fees || 0),
    total_amount: total,
    payment_status: 'unpaid',
    due_date: normalizedDueDate,
    created_by: staffId || null,
  });

  const lineItemDocs = buildLineItems(invoice._id, body);
  if (lineItemDocs.length) await InvoiceLineItem.insertMany(lineItemDocs);

  // Notify student
  if (student.user) {
    await Notification.create({
      user: student.user,
      title: 'New Invoice',
      message: `A new invoice ${invoice.invoice_code} for ${body.invoice_month} has been created. Amount: ${total.toLocaleString('vi-VN')} VND.`,
      notification_type: 'info',
      category: 'payment',
      related_id: invoice._id.toString(),
    }).catch(() => {});
    emitInvoiceNotification(io, student.user, {
      title: 'New Invoice',
      message: `A new invoice ${invoice.invoice_code} for ${body.invoice_month} has been created. Amount: ${total.toLocaleString('vi-VN')} VND.`,
      relatedId: invoice._id,
    });
  }

  emitInvoiceRealtime(io, invoice, 'created');

  return { ...invoice.toJSON(), id: invoice._id };
};

const parseInvoiceMonth = (invoiceMonth) => {
  const [year, month] = String(invoiceMonth || '').split('-').map(Number);
  if (!year || !month) throw new AppError('invoice_month must be in YYYY-MM format', 400);
  return { year, month };
};

const createInvoiceForStudent = async (body, staffId, io = null) => {
  const { student_code } = body;
  if (!student_code) throw new AppError('student_code is required', 400);

  const student = await findStudentByCode(student_code).lean();
  if (!student) throw new AppError(`Student ${student_code} not found`, 404);

  const contract = await Contract.findOne({ student: student._id, status: 'active' }).lean();
  if (!contract) throw new AppError(`Student ${student_code} has no active contract`, 400);

  return createSingleInvoice({ student, roomId: contract.room, body, staffId, io });
};

const createEWInvoiceForStudent = async (body, io = null) => {
  const { student_code, invoice_month, due_date } = body;
  if (!student_code) throw new AppError('student_code is required', 400);

  const student = await findStudentByCode(student_code).lean();
  if (!student) throw new AppError(`Student ${student_code} not found`, 404);

  const { year, month } = parseInvoiceMonth(invoice_month);
  return createEWInvoices({
    month,
    year,
    student_id: student._id.toString(),
    due_date,
  }, io);
};

const createInvoicesForRoom = async (roomId, body, staffId, io = null) => {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new AppError('Room not found', 404);

  const contracts = await Contract.find({ room: roomId, status: 'active' }).lean();
  if (!contracts.length) throw new AppError('No active students found in this room', 400);

  const studentIds = contracts.map((c) => c.student);
  const students = await Student.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

  const created = [];
  for (const contract of contracts) {
    const student = studentMap.get(contract.student.toString());
    if (student) {
      const inv = await createSingleInvoice({ student, roomId, body, staffId, io });
      created.push(inv);
    }
  }
  return { created: created.length, invoices: created };
};

const createInvoicesForBlock = async (blockId, body, staffId, io = null) => {
  const rooms = await Room.find({ block: blockId }, '_id').lean();
  if (!rooms.length) throw new AppError('No rooms found in this block', 404);

  const roomIds = rooms.map((r) => r._id);
  const contracts = await Contract.find({ room: { $in: roomIds }, status: 'active' }).lean();
  if (!contracts.length) throw new AppError('No active students found in this block', 400);

  const studentIds = contracts.map((c) => c.student);
  const students = await Student.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));
  const contractRoomMap = new Map(contracts.map((c) => [c.student.toString(), c.room]));

  const created = [];
  for (const contract of contracts) {
    const student = studentMap.get(contract.student.toString());
    if (student) {
      const roomId = contractRoomMap.get(contract.student.toString());
      const inv = await createSingleInvoice({ student, roomId, body, staffId, io });
      created.push(inv);
    }
  }
  return { created: created.length, invoices: created };
};

const createEWInvoicesForAllBlocks = async (body, io = null) => {
  const { year, month } = parseInvoiceMonth(body.invoice_month);
  return createEWInvoices({
    month,
    year,
    due_date: body.due_date,
  }, io);
};

const cancelInvoice = async (invoiceId, io = null) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.payment_status === 'paid') throw new AppError('Cannot cancel a paid invoice', 400);
  const invoiceSnapshot = invoice.toObject();
  await InvoiceLineItem.deleteMany({ invoice: invoice._id });
  await invoice.deleteOne();
  emitInvoiceRealtime(io, invoiceSnapshot, 'deleted');
  return { deleted: true };
};

const deleteInvoice = async (invoiceId, io = null) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.payment_status === 'paid') throw new AppError('Cannot delete a paid invoice', 400);
  const invoiceSnapshot = invoice.toObject();
  await InvoiceLineItem.deleteMany({ invoice: invoice._id });
  await Invoice.deleteOne({ _id: invoice._id });
  emitInvoiceRealtime(io, invoiceSnapshot, 'deleted');
  return { deleted: true };
};

module.exports = {
  getMyInvoices,
  createPayosLinkForInvoice,
  getInvoicePaymentStatus,
  handlePayosWebhook,
  // Manager
  getInvoices,
  getInvoiceDetail,
  createInvoiceForStudent,
  createEWInvoiceForStudent,
  createInvoicesForRoom,
  createInvoicesForBlock,
  createEWInvoicesForAllBlocks,
  cancelInvoice,
  deleteInvoice,
};
