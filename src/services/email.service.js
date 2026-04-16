const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    // Email is optional at runtime but required by the task;
    // we fail softly and log in callers.
    return null;
  }

  const port = Number(SMTP_PORT);
  const secure = String(SMTP_SECURE).toLowerCase() === 'true';

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  transporter.__from = SMTP_FROM || SMTP_USER;
  return transporter;
};

const sendMail = async ({ to, subject, html, text }) => {
  const t = getTransporter();
  if (!t) return { skipped: true };

  return t.sendMail({
    from: t.__from,
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
  });
};

const sendPaymentSuccessEmail = async ({ to, studentName, invoiceCode, amountVnd }) => {
  const subject = `Payment success: ${invoiceCode}`;
  const amountStr = new Intl.NumberFormat('vi-VN').format(amountVnd) + ' VND';
  const safeName = studentName || 'Student';

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2 style="margin: 0 0 12px">Payment successful</h2>
      <p style="margin: 0 0 8px">Hi ${safeName},</p>
      <p style="margin: 0 0 8px">
        We received your payment for invoice <b>${invoiceCode}</b>.
      </p>
      <p style="margin: 0 0 8px">
        Amount: <b>${amountStr}</b>
      </p>
      <p style="margin: 16px 0 0; color: #666">
        Thank you.
      </p>
    </div>
  `;

  const text = `Payment successful. Invoice ${invoiceCode}. Amount ${amountStr}.`;

  return sendMail({ to, subject, html, text });
};

module.exports = {
  sendMail,
  sendPaymentSuccessEmail,
};
