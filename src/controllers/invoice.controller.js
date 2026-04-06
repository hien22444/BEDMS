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

module.exports = {
  getMyInvoices,
  createPayosLinkForInvoice,
  getInvoicePaymentStatus,
};
