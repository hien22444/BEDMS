const cron = require('node-cron');
const { BookingRequest, Bed, Room, Invoice, InvoiceLineItem, Payment, Contract } = require('../models');
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

          // Rollback bed only if already 'reserved' (payment confirmed before expiry).
          // If still 'available' (awaiting_payment, not yet reserved) or 'occupied' (hold-bed),
          // no status change or available_beds adjustment is needed.
          if (booking.bed) {
            const currentBed = await Bed.findById(booking.bed).select('status').lean();
            if (currentBed?.status === 'reserved') {
              await Bed.findByIdAndUpdate(booking.bed, { status: 'available' });
              if (booking.room) {
                await Room.findByIdAndUpdate(booking.room, {
                  $inc: { available_beds: 1 },
                  $set: { status: 'available' },
                });
              }
            }
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

/**
 * Auto-activate upcoming contracts whose start_date has passed.
 * Runs daily at 00:05 as a safety net alongside the lazy activation
 * that happens in getBookingWindowStatus.
 */
const scheduleContractActivation = () => {
  cron.schedule(
    '5 0 * * *',
    async () => {
      try {
        const now = new Date();
        // Find upcoming contracts to activate and sync their beds
        const toActivate = await Contract.find(
          { status: 'upcoming', start_date: { $lte: now } },
          { bed: 1 }
        ).lean();

        if (toActivate.length > 0) {
          const bedIds = toActivate.map((c) => c.bed);
          const [contractResult] = await Promise.all([
            Contract.updateMany(
              { status: 'upcoming', start_date: { $lte: now } },
              { $set: { status: 'active' } }
            ),
            Bed.updateMany(
              { _id: { $in: bedIds }, status: 'reserved' },
              { $set: { status: 'occupied' } }
            ),
          ]);
          console.log(`[ContractActivation] Activated ${contractResult.modifiedCount} contract(s), beds set to occupied`);
        }

        // Safety net: active/extended contracts whose bed is not 'occupied'
        const desynced = await Contract.find(
          { status: { $in: ['active', 'extended'] } },
          { bed: 1 }
        ).lean();
        if (desynced.length > 0) {
          const desyncedBedIds = desynced.map((c) => c.bed);
          const fixResult = await Bed.updateMany(
            { _id: { $in: desyncedBedIds }, status: { $in: ['available', 'reserved'] } },
            { $set: { status: 'occupied' } }
          );
          if (fixResult.modifiedCount > 0) {
            console.log(`[ContractActivation] Fixed ${fixResult.modifiedCount} desynced bed(s) → occupied`);
          }
        }
      } catch (err) {
        console.error('[ContractActivation] Error:', err.message);
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  console.log('[ContractActivation] Job scheduled daily at 00:05');
};

module.exports = { scheduleBookingExpiry, scheduleContractActivation };
