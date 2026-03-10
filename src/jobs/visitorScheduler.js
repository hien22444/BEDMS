const cron = require('node-cron');
const { VisitorRequest, VisitorCheckin } = require('../models');

/**
 * Auto-expire visitor requests daily at 17:05.
 *
 * Rules:
 *  - pending  → cancelled   if visit_date has passed (never approved)
 *  - approved → completed   if visit_date has passed AND no check-in record exists at all
 *                           (visitor never showed up)
 *
 * If any visitor was checked in (even already checked out), the request is left as
 * "approved" — security must complete manually.
 *
 * "Passed" means: visit_date <= today (Vietnam time).
 * Running at 17:05 ensures today's visit window (max 17:00) is already over.
 */
const scheduleVisitorExpiry = () => {
  // "5 17 * * *" = every day at 17:05
  cron.schedule(
    '5 17 * * *',
    async () => {
      try {
        const now = new Date();
        // "tomorrow at 00:00" — so visit_date < tomorrowStart covers today AND all past dates
        const tomorrowStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
          0,
          0,
          0,
          0
        );

        // 1. Cancel pending requests whose visit date is today or earlier (visit window already over)
        const cancelResult = await VisitorRequest.updateMany(
          { status: 'pending', visit_date: { $lt: tomorrowStart } },
          { $set: { status: 'cancelled' } }
        );

        // 2. Find approved requests whose visit date is today or earlier
        const approvedRequests = await VisitorRequest.find({
          status: 'approved',
          visit_date: { $lt: tomorrowStart },
        }).lean();

        let completedCount = 0;
        let skippedCount = 0;

        for (const req of approvedRequests) {
          // Skip if any check-in record exists (visitor came in — security must complete manually)
          const hasCheckin = await VisitorCheckin.exists({ request: req._id });

          if (hasCheckin) {
            skippedCount++;
            continue;
          }

          await VisitorRequest.findByIdAndUpdate(req._id, { status: 'completed' });
          completedCount++;
        }

        if (cancelResult.modifiedCount > 0 || completedCount > 0 || skippedCount > 0) {
          console.log(
            `[VisitorScheduler] cancelled=${cancelResult.modifiedCount}, completed=${completedCount}, skipped (visitors still inside)=${skippedCount}`
          );
        }
      } catch (err) {
        console.error('[VisitorScheduler] Error during daily expiry:', err.message);
      }
    },
    {
      timezone: 'Asia/Ho_Chi_Minh',
    }
  );

  console.log('[VisitorScheduler] Daily expiry job scheduled at 17:05 ICT');
};

module.exports = { scheduleVisitorExpiry };
