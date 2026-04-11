const cron = require('node-cron');
const { BookingRequest, Bed, Room, Invoice, InvoiceLineItem, Payment } = require('../models');
const { cancelPayosPaymentLink } = require('../services/payos.service');

/**
 * Auto-expire bookings awaiting payment.
 * Runs every minute to ensure the 10-minute hold is enforced even if user leaves the page.
 */
const scheduleBookingExpiry = () => {
  cron.schedule(
    '* * * * *',
    async () => {
      const now = new Date();
      try {
        // Process in small batches to avoid long job time
        const candidates = await BookingRequest.find({
          status: 'awaiting_payment',
          expires_at: { $ne: null, $lte: now },
        })
          .select('_id')
          .limit(50)
          .lean();

        for (const c of candidates) {
          // Claim this booking to avoid double-processing
          const booking = await BookingRequest.findOneAndUpdate(
            { _id: c._id, status: 'awaiting_payment', expires_at: { $lte: now } },
            { $set: { status: 'expired' } },
            { new: true }
          ).lean();

          if (!booking) continue;

          // Best-effort: cancel PayOS payment link if exists
          const payment = await Payment.findOne({
            invoice: booking.invoice,
            payment_method: 'payos',
            payment_status: 'pending',
          }).lean();

          if (payment?.payos_order_code) {
            await cancelPayosPaymentLink(
              payment.payos_order_code,
              'Booking expired (10-minute hold)'
            );
            await Payment.updateOne({ _id: payment._id }, { $set: { payment_status: 'expired' } });
          }

          // Rollback bed and restore room available_beds
          if (booking.bed) {
            await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
          }
          if (booking.room) {
            await Room.findByIdAndUpdate(booking.room, {
              $inc: { available_beds: 1 },
              $set: { status: 'available' },
            });
          }
          if (booking.invoice) {
            await InvoiceLineItem.deleteMany({ invoice: booking.invoice });
            await Invoice.deleteOne({ _id: booking.invoice });
          }
        }
      } catch (err) {
        console.error('[BookingExpiryScheduler] Error:', err.message);
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  console.log('[BookingExpiryScheduler] Job scheduled every minute');
};

module.exports = { scheduleBookingExpiry };
