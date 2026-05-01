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

const formatDateTimeVi = (value) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(dt);
};

const sendBookingPaymentSuccessEmail = async ({
  to,
  studentName,
  studentCode,
  roomLabel,
  semester,
  startDate,
  transactionCode,
  amountVnd,
  paidAt,
  bookingSource = 'new_booking',
}) => {
  const safeName = studentName || 'Sinh viên';
  const amountStr = `${new Intl.NumberFormat('vi-VN').format(Number(amountVnd) || 0)} VND`;
  const startDateStr = startDate
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(startDate))
    : '-';
  const paidAtStr = formatDateTimeVi(paidAt || new Date());
  const shouldShowFaceNotice = bookingSource === 'new_booking';

  const subject = '[Dormitory] Payment Successful - Booking Confirmed';

  const html = `
    <div style="margin:0;padding:0;background:#eef2ff;font-family:Inter,Arial,sans-serif;color:#0f172a;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;">
        <tr>
          <td align="center">
            <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">
              <tr>
                <td style="padding:0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 45%,#4f46e5 100%);">
                    <tr>
                      <td style="padding:26px 28px 10px 28px;color:#c7d2fe;font-size:13px;letter-spacing:.2px;">
                        FUDA Dormitory
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 28px 24px 28px;color:#ffffff;">
                        <div style="font-size:28px;line-height:1.25;font-weight:800;">Payment Successful - Booking Confirmed</div>
                        <div style="margin-top:8px;font-size:14px;opacity:.95;">
                          Your payment has been recorded and your accommodation booking is now confirmed.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 12px 0;">Hi <strong>${safeName}</strong>,</p>
                  <p style="margin:0 0 18px 0;line-height:1.65;color:#334155;">
                    Your dormitory bed booking payment has been completed successfully. Please review the details below.
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;">
                    <tr>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;">Student code</td>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;" align="right"><strong>${studentCode || '-'}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;">Room/Bed</td>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;" align="right"><strong>${roomLabel || '-'}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;">Semester</td>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;" align="right"><strong>${semester || '-'}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;">Start date</td>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;" align="right"><strong>${startDateStr}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;">Transaction code</td>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;" align="right"><strong>${transactionCode || '-'}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;">Amount paid</td>
                      <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;" align="right"><strong>${amountStr}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:13px 14px;">Payment time</td>
                      <td style="padding:13px 14px;" align="right"><strong>${paidAtStr}</strong></td>
                    </tr>
                  </table>

                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#eff6ff;border:1px solid #93c5fd;border-radius:14px;">
                    <tr>
                      <td style="padding:16px 16px 8px 16px;font-size:16px;font-weight:800;color:#1d4ed8;">
                        Important notes after booking confirmation
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 16px 16px 16px;color:#1e3a8a;line-height:1.6;">
                        You can review your booking in the My Booking section.
                        ${
                          shouldShowFaceNotice
                            ? '<div style="margin-top:10px;font-size:18px;line-height:1.5;font-weight:800;color:#1d4ed8;">Please meet the <strong>manager</strong> to complete face registration before using the service.</div>'
                            : ''
                        }
                      </td>
                    </tr>
                  </table>

                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />

                  <p style="margin:0;font-size:13px;color:#64748b;">
                    Need support? Please contact the manager.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;padding:14px 28px;font-size:12px;color:#94a3b8;">
                  © 2026 Dormitory Management System. This is an automated email, please do not reply directly.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    'Payment successful - booking confirmed.',
    `Student: ${safeName}${studentCode ? ` (${studentCode})` : ''}`,
    `Room/Bed: ${roomLabel || '-'}`,
    `Semester: ${semester || '-'}`,
    `Start date: ${startDateStr}`,
    `Transaction code: ${transactionCode || '-'}`,
    `Amount paid: ${amountStr}`,
    `Payment time: ${paidAtStr}`,
    shouldShowFaceNotice
      ? 'Please meet the manager to complete face registration before using the service.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return sendMail({ to, subject, html, text });
};

module.exports = {
  sendMail,
  sendPaymentSuccessEmail,
  sendBookingPaymentSuccessEmail,
};
