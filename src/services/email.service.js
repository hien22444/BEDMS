const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const sendMail = async ({ to, subject, html, text, cc, bcc, replyTo, attachments }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const fromName = process.env.EMAIL_FROM_NAME;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !fromAddress) return { skipped: true };

  const normalize = (v) =>
    Array.isArray(v)
      ? v
      : String(v)
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean);

  const toArr = normalize(to).map((email) => ({ email }));

  const payload = {
    sender: { name: fromName || fromAddress, email: fromAddress },
    to: toArr,
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
    ...(cc ? { cc: normalize(cc).map((email) => ({ email })) } : {}),
    ...(bcc ? { bcc: normalize(bcc).map((email) => ({ email })) } : {}),
    ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    ...(attachments ? { attachment: attachments } : {}),
  };

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }

  return res.json();
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
