const AppError = require('../utils/AppError');

let payosInstancePromise = null;

const getPayOS = async () => {
  if (!payosInstancePromise) {
    payosInstancePromise = import('@payos/node').then((m) => {
      const PayOS = m?.PayOS || m?.default?.PayOS || m?.default;

      if (!PayOS) {
        throw new Error('Cannot load PayOS SDK (@payos/node)');
      }

      const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = process.env;
      if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
        throw new AppError(
          'Missing PayOS config. Please set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY in .env',
          500
        );
      }

      return new PayOS({
        clientId: PAYOS_CLIENT_ID,
        apiKey: PAYOS_API_KEY,
        checksumKey: PAYOS_CHECKSUM_KEY,
      });
    });
  }

  return payosInstancePromise;
};

const createPayosPaymentLink = async ({
  orderCode,
  amount,
  description,
  returnUrl,
  cancelUrl,
  buyerEmail,
  buyerName,
  items,
}) => {
  const payOS = await getPayOS();

  // PayOS requires amount as integer VND
  const payload = {
    orderCode,
    amount,
    description,
    returnUrl,
    cancelUrl,
    ...(buyerEmail ? { buyerEmail } : {}),
    ...(buyerName ? { buyerName } : {}),
    ...(Array.isArray(items) ? { items } : {}),
  };

  // SDK naming: paymentRequests.create / get / cancel
  return payOS.paymentRequests.create(payload);
};

const getPayosPaymentInfo = async (orderCode) => {
  const payOS = await getPayOS();
  return payOS.paymentRequests.get(orderCode);
};

const cancelPayosPaymentLink = async (orderCode, cancellationReason) => {
  const payOS = await getPayOS();
  try {
    // Some SDK versions accept only orderCode; keep it compatible.
    return await payOS.paymentRequests.cancel(
      orderCode,
      cancellationReason ? { cancellationReason } : undefined
    );
  } catch (_) {
    // Cancellation is best-effort; do not hard-fail business rollback.
    return null;
  }
};

const verifyPayosWebhook = async (body) => {
  const payOS = await getPayOS();
  if (!payOS?.webhooks?.verify) {
    throw new AppError('PayOS SDK webhooks.verify() is not available', 500);
  }
  return payOS.webhooks.verify(body);
};

/**
 * Đăng ký webhook URL với PayOS (cần gọi lại mỗi khi ngrok URL thay đổi).
 * PayOS lưu URL này và sẽ POST sự kiện thanh toán/hủy về đây.
 */
const confirmPayosWebhook = async () => {
  const webhookUrl = process.env.PAYOS_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes('<your-ngrok-id>')) {
    console.warn('[PayOS] PAYOS_WEBHOOK_URL chưa được cấu hình — webhook sẽ không hoạt động.');
    return;
  }
  try {
    const payOS = await getPayOS();
    const result = await payOS.webhooks.confirm(webhookUrl);
    console.log(`[PayOS] Webhook đã đăng ký: ${webhookUrl}`, result);
  } catch (err) {
    console.error('[PayOS] Lỗi đăng ký webhook:', err?.message || err);
  }
};

module.exports = {
  getPayOS,
  createPayosPaymentLink,
  getPayosPaymentInfo,
  cancelPayosPaymentLink,
  verifyPayosWebhook,
  confirmPayosWebhook,
};
