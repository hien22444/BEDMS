const AppError = require('../utils/AppError');
const {
  BookingRequest,
  Invoice,
  InvoiceLineItem,
  Notification,
  Payment,
  Student,
  User,
} = require('../models');
const { createPayosPaymentLink, getPayosPaymentInfo } = require('./payos.service');
const { sendPaymentSuccessEmail } = require('./email.service');

const EW_INVOICE_REGEX = /^EW-/;

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
    invoice: {
      ...invoice.toJSON(),
      id: invoice._id,
    },
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
  if (!EW_INVOICE_REGEX.test(invoice.invoice_code)) {
    throw new AppError(400, 'Only EW invoices can be paid from the utilities page');
  }
  if (invoice.payment_status === 'paid') throw new AppError(400, 'Invoice is already paid');
  if (invoice.payment_status === 'cancelled') throw new AppError(400, 'Invoice is cancelled');
  if (invoice.total_amount <= 0) {
    throw new AppError(400, 'Invoice amount must be greater than zero');
  }

  const existingPayment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
    payment_status: 'pending',
  })
    .sort({ created_at: -1 })
    .lean();

  if (existingPayment?.payos_checkout_url) {
    return {
      invoice: {
        ...invoice.toJSON(),
        id: invoice._id,
      },
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
        name: `Utility invoice ${invoice.invoice_code}`,
        quantity: 1,
        price: invoice.total_amount,
      },
    ],
  });

  const payosPaymentLinkId = paymentLink?.paymentLinkId || paymentLink?.id || null;
  const payosCheckoutUrl = paymentLink?.checkoutUrl || paymentLink?.checkout_url || null;
  const payosQrCode = paymentLink?.qrCode || paymentLink?.qr_code || null;

  const payment = await Payment.create({
    transaction_code: `EW-PAYOS-${orderCode}`,
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
    invoice: {
      ...invoice.toJSON(),
      id: invoice._id,
    },
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
      invoice: {
        ...invoice.toJSON(),
        id: invoice._id,
      },
    };
  }

  const payment = await Payment.findOne({
    invoice: invoice._id,
    payment_method: 'payos',
  }).sort({ created_at: -1 });

  if (!payment?.payos_order_code) {
    return {
      status: 'pending',
      paid: false,
      message: 'Payment link has not been created yet',
      invoice: {
        ...invoice.toJSON(),
        id: invoice._id,
      },
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
      invoice: {
        ...invoice.toJSON(),
        id: invoice._id,
      },
      payos: buildPayosPayload(payment),
    };
  }

  if (!isPayosPaid(payosInfo)) {
    return {
      status: 'pending',
      paid: false,
      message: 'Payment not completed',
      invoice: {
        ...invoice.toJSON(),
        id: invoice._id,
      },
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

module.exports = {
  getMyInvoices,
  createPayosLinkForInvoice,
  getInvoicePaymentStatus,
  handlePayosWebhook,
};
