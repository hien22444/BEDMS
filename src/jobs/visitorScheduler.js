const cron = require('node-cron');
const { VisitorRequest, VisitorCheckin } = require('../models');
const { getStartOfNextDayInDormTimezone } = require('../utils/dateOnly');

/**
 * Auto-expire visitor requests daily at 17:05.
 *
 * Rules:
 *  - pending -> cancelled if visit_date has passed (never approved)
 *  - approved -> completed if visit_date has passed and no check-in record exists
 *
 * If any visitor was checked in, even already checked out, the request is left as
 * "approved" so security can complete it manually.
 *
 * "Passed" means visit_date <= today in Vietnam time. Running at 17:05 ensures
 * today's visit window has already ended.
 */
const scheduleVisitorExpiry = () => {
  cron.schedule(
    '5 17 * * *',
    async () => {
      try {
        const tomorrowStart = getStartOfNextDayInDormTimezone();

        const cancelResult = await VisitorRequest.updateMany(
          { status: 'pending', visit_date: { $lt: tomorrowStart } },
          { $set: { status: 'cancelled' } }
        );

        const approvedRequests = await VisitorRequest.find({
          status: 'approved',
          visit_date: { $lt: tomorrowStart },
        }).lean();

        let completedCount = 0;
        let skippedCount = 0;

        for (const req of approvedRequests) {
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
