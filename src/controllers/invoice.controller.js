const { status } = require('http-status');
const { invoiceService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getMyInvoices = catchAsync(async (req, res) => {
  const data = await invoiceService.getMyInvoices(req.user.id);
  res.success(data, status.OK);
});

const createPayosLinkForInvoice = catchAsync(async (req, res) => {
  const data = await invoiceService.createPayosLinkForInvoice(req.params.id, req.user.id);
  res.success(data, status.OK);
});

const getInvoicePaymentStatus = catchAsync(async (req, res) => {
  const data = await invoiceService.getInvoicePaymentStatus(req.params.id, req.user.id);
  res.success(data, status.OK);
});

// ─── Manager Controllers ───────────────────────────────────────────────────────

const getInvoices = catchAsync(async (req, res) => {
  const data = await invoiceService.getInvoices(req.query);
  res.success(data, status.OK);
});

const getInvoiceDetail = catchAsync(async (req, res) => {
  const data = await invoiceService.getInvoiceDetail(req.params.id);
  res.success(data, status.OK);
});

const createInvoiceForStudent = catchAsync(async (req, res) => {
  const data = await invoiceService.createInvoiceForStudent(req.body, req.user.id);
  res.success(data, status.CREATED);
});

const createInvoicesForRoom = catchAsync(async (req, res) => {
  const data = await invoiceService.createInvoicesForRoom(req.params.roomId, req.body, req.user.id);
  res.success(data, status.CREATED);
});

const createInvoicesForBlock = catchAsync(async (req, res) => {
  const data = await invoiceService.createInvoicesForBlock(req.params.blockId, req.body, req.user.id);
  res.success(data, status.CREATED);
});

const cancelInvoice = catchAsync(async (req, res) => {
  const data = await invoiceService.cancelInvoice(req.params.id);
  res.success(data, status.OK);
});

const deleteInvoice = catchAsync(async (req, res) => {
  const data = await invoiceService.deleteInvoice(req.params.id);
  res.success(data, status.OK);
});

module.exports = {
  getMyInvoices,
  createPayosLinkForInvoice,
  getInvoicePaymentStatus,
  // Manager
  getInvoices,
  getInvoiceDetail,
  createInvoiceForStudent,
  createInvoicesForRoom,
  createInvoicesForBlock,
  cancelInvoice,
  deleteInvoice,
};
