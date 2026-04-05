const AppError = require('../utils/AppError');
const { Invoice, InvoiceLineItem, Student } = require('../models');

/**
 * Get all EW invoices for the logged-in student
 */
const getMyInvoices = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError(404, 'Student profile not found');

  const invoices = await Invoice.find({ student: student._id })
    .populate('room', 'room_number')
    .sort({ createdAt: -1 })
    .lean();

  const invoiceIds = invoices.map((i) => i._id);
  const lineItems = await InvoiceLineItem.find({ invoice: { $in: invoiceIds } }).lean();

  return invoices.map((inv) => ({
    ...inv,
    id: inv._id,
    line_items: lineItems.filter((li) => li.invoice.toString() === inv._id.toString()),
  }));
};

module.exports = { getMyInvoices };
