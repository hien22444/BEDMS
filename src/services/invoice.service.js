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

const generateInvoiceOrderCode = () => Number(`2${Date.now()}${Math.floor(Math.random() * 10)}`);

const isPayosPaid = (info) => {
  const status = String(
    info?.status || info?.data?.status || info?.paymentStatus || ''
  ).toLowerCase();
  return status === 'paid' || status === 'success' || status === 'completed';
};

const findStudentByUserId = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError(404, 'Student profile not found');
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

const finalizeUtilityInvoicePayment = async (invoice, payment, payosInfo) => {
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

  if (!invoice) throw new AppError(404, 'Invoice not found');
  if (invoice.payment_status === 'paid') throw new AppError(400, 'Invoice is already paid');
  if (invoice.payment_status === 'cancelled') throw new AppError(400, 'Invoice is cancelled');
  if (invoice.total_amount <= 0) {
    throw new AppError(400, 'Invoice amount must be greater than zero');
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

  const existingPayment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
    payment_status: 'pending',
    amount: invoice.total_amount,
  })
    .sort({ created_at: -1 })
    .lean();

  if (existingPayment?.payos_checkout_url) {
    return {
      invoice: buildInvoiceResponse(invoice),
      payos: buildPayosPayload(existingPayment),
    };
  }

  const returnUrl = process.env.PAYOS_RETURN_URL;
  const cancelUrl = process.env.PAYOS_CANCEL_URL;
  if (!returnUrl || !cancelUrl) {
    throw new AppError(500, 'PayOS return or cancel URL is not configured');
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

const getInvoicePaymentStatus = async (invoiceId, userId) => {
  const student = await findStudentByUserId(userId);
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    student: student._id,
  });

  if (!invoice) throw new AppError(404, 'Invoice not found');

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

  const payosInfo = await getPayosPaymentInfo(payment.payos_order_code);
  const payosStatus = String(payosInfo?.status || payosInfo?.data?.status || '').toLowerCase();

  if (payosStatus === 'cancelled' || payosStatus === 'canceled') {
    if (payment.payment_status === 'pending') {
      payment.payment_status = 'cancelled';
      payment.transaction_details = payosInfo;
      await payment.save();
    }
    return {
      status: 'cancelled',
      paid: false,
      message: 'Payment was cancelled',
      invoice: buildInvoiceResponse(invoice),
      payos: buildPayosPayload(payment),
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

  return finalizeUtilityInvoicePayment(invoice, payment, payosInfo);
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
    payment.payment_status = 'cancelled';
    payment.transaction_details = webhookData;
    await payment.save();
    return { ok: true, handled: true, status: 'cancelled' };
  }

  if (status === 'paid' || status === 'success' || status === 'completed') {
    return finalizeUtilityInvoicePayment(invoice, payment, webhookData);
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
    filter.payment_status = payment_status;
  } else {
    filter.payment_status = { $ne: 'cancelled' };
  }
  if (invoice_month) filter.invoice_month = { $regex: invoice_month, $options: 'i' };

  if (student_code) {
    const student = await Student.findOne({ student_code: student_code.trim() }).lean();
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
  if (!invoice) throw new AppError(404, 'Invoice not found');

  const lineItems = await InvoiceLineItem.find({ invoice: invoice._id }).lean();
  return { ...invoice, id: invoice._id, line_items: lineItems };
};

const createSingleInvoice = async ({ student, roomId, body, staffId }) => {
  const total =
    Number(body.room_fee || 0) +
    Number(body.electricity_fee || 0) +
    Number(body.water_fee || 0) +
    Number(body.service_fee || 0) +
    Number(body.other_fees || 0);

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
    due_date: new Date(body.due_date),
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
  }

  return { ...invoice.toJSON(), id: invoice._id };
};

const createInvoiceForStudent = async (body, staffId) => {
  const { student_code } = body;
  if (!student_code) throw new AppError(400, 'student_code is required');

  const student = await Student.findOne({ student_code: student_code.trim() }).lean();
  if (!student) throw new AppError(404, `Student ${student_code} not found`);

  const contract = await Contract.findOne({ student: student._id, status: 'active' }).lean();
  if (!contract) throw new AppError(400, `Student ${student_code} has no active contract`);

  return createSingleInvoice({ student, roomId: contract.room, body, staffId });
};

const createInvoicesForRoom = async (roomId, body, staffId) => {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new AppError(404, 'Room not found');

  const contracts = await Contract.find({ room: roomId, status: 'active' }).lean();
  if (!contracts.length) throw new AppError(400, 'No active students found in this room');

  const studentIds = contracts.map((c) => c.student);
  const students = await Student.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

  const created = [];
  for (const contract of contracts) {
    const student = studentMap.get(contract.student.toString());
    if (student) {
      const inv = await createSingleInvoice({ student, roomId, body, staffId });
      created.push(inv);
    }
  }
  return { created: created.length, invoices: created };
};

const createInvoicesForBlock = async (blockId, body, staffId) => {
  const rooms = await Room.find({ block: blockId }, '_id').lean();
  if (!rooms.length) throw new AppError(404, 'No rooms found in this block');

  const roomIds = rooms.map((r) => r._id);
  const contracts = await Contract.find({ room: { $in: roomIds }, status: 'active' }).lean();
  if (!contracts.length) throw new AppError(400, 'No active students found in this block');

  const studentIds = contracts.map((c) => c.student);
  const students = await Student.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));
  const contractRoomMap = new Map(contracts.map((c) => [c.student.toString(), c.room]));

  const created = [];
  for (const contract of contracts) {
    const student = studentMap.get(contract.student.toString());
    if (student) {
      const roomId = contractRoomMap.get(contract.student.toString());
      const inv = await createSingleInvoice({ student, roomId, body, staffId });
      created.push(inv);
    }
  }
  return { created: created.length, invoices: created };
};

const cancelInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError(404, 'Invoice not found');
  if (invoice.payment_status === 'paid') throw new AppError(400, 'Cannot cancel a paid invoice');
  invoice.payment_status = 'cancelled';
  await invoice.save();
  return { ...invoice.toJSON(), id: invoice._id };
};

const deleteInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError(404, 'Invoice not found');
  if (invoice.payment_status === 'paid') throw new AppError(400, 'Cannot delete a paid invoice');
  await InvoiceLineItem.deleteMany({ invoice: invoice._id });
  await Invoice.deleteOne({ _id: invoice._id });
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
  createInvoicesForRoom,
  createInvoicesForBlock,
  cancelInvoice,
  deleteInvoice,
};
