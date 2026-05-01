describe('email.service (Brevo)', () => {
  let emailService;

  beforeEach(() => {
    jest.resetModules();
    process.env.BREVO_API_KEY = 'test-key';
    process.env.EMAIL_FROM_NAME = 'DMS';
    process.env.EMAIL_FROM_ADDRESS = 'sender@example.com';
    global.fetch = jest.fn();
    emailService = require('./email.service');
  });

  afterEach(() => {
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.EMAIL_FROM_ADDRESS;
  });

  describe('sendMail', () => {
    it('returns { skipped: true } when BREVO_API_KEY is missing', async () => {
      delete process.env.BREVO_API_KEY;
      jest.resetModules();
      const { sendMail } = require('./email.service');
      const result = await sendMail({ to: 'a@b.com', subject: 'hi', text: 'hi' });
      expect(result).toEqual({ skipped: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns { skipped: true } when EMAIL_FROM_ADDRESS is missing', async () => {
      delete process.env.EMAIL_FROM_ADDRESS;
      jest.resetModules();
      const { sendMail } = require('./email.service');
      const result = await sendMail({ to: 'a@b.com', subject: 'hi', text: 'hi' });
      expect(result).toEqual({ skipped: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls Brevo API with correct headers and payload for a single recipient', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: 'abc-123' }),
      });

      await emailService.sendMail({
        to: 'student@example.com',
        subject: 'Test',
        html: '<p>hi</p>',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({ method: 'POST' })
      );
      const [, opts] = global.fetch.mock.calls[0];
      expect(opts.headers['api-key']).toBe('test-key');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        sender: { name: 'DMS', email: 'sender@example.com' },
        to: [{ email: 'student@example.com' }],
        subject: 'Test',
        htmlContent: '<p>hi</p>',
      });
    });

    it('splits comma-joined recipients into Brevo to[] objects', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendMail({
        to: 'a@a.com,b@b.com , c@c.com',
        subject: 'hi',
        text: 'hi',
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.to).toEqual([
        { email: 'a@a.com' },
        { email: 'b@b.com' },
        { email: 'c@c.com' },
      ]);
      expect(body.textContent).toBe('hi');
    });

    it('accepts a to array directly', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendMail({
        to: ['a@a.com', 'b@b.com'],
        subject: 'hi',
        text: 'hi',
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.to).toEqual([{ email: 'a@a.com' }, { email: 'b@b.com' }]);
    });

    it('uses fromAddress as sender name when EMAIL_FROM_NAME is missing', async () => {
      delete process.env.EMAIL_FROM_NAME;
      jest.resetModules();
      const { sendMail } = require('./email.service');
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await sendMail({ to: 'a@b.com', subject: 'hi', text: 'hi' });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.sender).toEqual({
        name: 'sender@example.com',
        email: 'sender@example.com',
      });
    });

    it('throws on non-ok Brevo response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"message":"unauthorized"}',
      });

      await expect(
        emailService.sendMail({ to: 'a@b.com', subject: 'hi', text: 'hi' })
      ).rejects.toThrow('Brevo API error 401');
    });

    it('forwards optional cc, bcc, and replyTo', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendMail({
        to: 'a@a.com',
        cc: 'c1@c.com,c2@c.com',
        bcc: ['b1@b.com'],
        replyTo: 'reply@r.com',
        subject: 'hi',
        text: 'hi',
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.cc).toEqual([{ email: 'c1@c.com' }, { email: 'c2@c.com' }]);
      expect(body.bcc).toEqual([{ email: 'b1@b.com' }]);
      expect(body.replyTo).toEqual({ email: 'reply@r.com' });
    });
  });

  describe('sendPaymentSuccessEmail', () => {
    it('sends a formatted payment email with VND amount', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendPaymentSuccessEmail({
        to: 'student@example.com',
        studentName: 'Lam',
        invoiceCode: 'INV-001',
        amountVnd: 500000,
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.subject).toBe('Payment success: INV-001');
      expect(body.to).toEqual([{ email: 'student@example.com' }]);
      expect(body.htmlContent).toContain('500.000 VND');
      expect(body.htmlContent).toContain('Lam');
      expect(body.textContent).toContain('INV-001');
    });

    it('falls back to "Student" when studentName is empty', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendPaymentSuccessEmail({
        to: 'student@example.com',
        studentName: '',
        invoiceCode: 'INV-002',
        amountVnd: 100000,
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.htmlContent).toContain('Hi Student');
    });
  });

  describe('sendBookingPaymentSuccessEmail', () => {
    it('sends booking success email and includes face-registration notice for new booking', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendBookingPaymentSuccessEmail({
        to: 'student@example.com',
        studentName: 'Lam',
        studentCode: 'DE180775',
        roomLabel: 'A101-1 Bed 1',
        semester: 'Fall-2026',
        startDate: '2026-09-01',
        transactionCode: 'PAY-20260501-0001',
        amountVnd: 4500000,
        paidAt: '2026-05-01T11:18:00.000Z',
        bookingSource: 'new_booking',
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.subject).toBe('[Dormitory] Payment Successful - Booking Confirmed');
      expect(body.htmlContent).toContain('A101-1 Bed 1');
      expect(body.htmlContent).toContain('PAY-20260501-0001');
      expect(body.htmlContent).toContain('face registration');
    });

    it('does not include face-registration notice for hold booking', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await emailService.sendBookingPaymentSuccessEmail({
        to: 'student@example.com',
        studentName: 'Lam',
        roomLabel: 'A101-1 Bed 1',
        amountVnd: 4500000,
        bookingSource: 'hold',
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.htmlContent).not.toContain('face registration');
    });
  });
});
