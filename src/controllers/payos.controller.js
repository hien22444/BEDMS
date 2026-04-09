const { status } = require('http-status');
const { invoiceService } = require('../services');
const { verifyPayosWebhook } = require('../services/payos.service');
const catchAsync = require('../utils/catchAsync');

/**
 * PayOS webhook endpoint.
 * PayOS sends payment status updates; we verify signature with PAYOS_CHECKSUM_KEY.
 */
const handleWebhook = catchAsync(async (req, res) => {
  // PayOS sends a validation probe with no data/signature when registering webhook
  if (!req.body?.data && !req.body?.signature) {
    return res.status(status.OK).json({ ok: true });
  }

  const webhookData = await verifyPayosWebhook(req.body);

  // Delegate business update to invoice service, which routes booking-linked
  // payments back to booking service and handles standalone invoice payments.
  const io = req.app.get('io');
  const result = await invoiceService.handlePayosWebhook(webhookData, io);

  res.success(result || { ok: true }, status.OK);
});

module.exports = {
  handleWebhook,
};
