const { status } = require('http-status');
const { bookingService } = require('../services');
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

  // Delegate business update to booking service (idempotent)
  const result = await bookingService.handlePayosWebhook(webhookData);

  res.success(result || { ok: true }, status.OK);
});

module.exports = {
  handleWebhook,
};
