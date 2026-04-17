const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { bookingController } = require('../../controllers');

const router = express.Router();

// ─── Student endpoints ───

router.get(
  '/window-status',
  authenticate,
  authorize('student'),
  bookingController.getBookingWindowStatus
);

router.get(
  '/next-semester',
  authenticate,
  authorize('student'),
  bookingController.getNextSemesterInfo
);

router.get(
  '/options/room-types',
  authenticate,
  authorize('student'),
  bookingController.getAvailableRoomTypes
);

router.get(
  '/options/dorms',
  authenticate,
  authorize('student'),
  bookingController.getDormsForBooking
);

router.get(
  '/options/floors',
  authenticate,
  authorize('student'),
  bookingController.getFloorsForBooking
);

router.get(
  '/options/blocks',
  authenticate,
  authorize('student'),
  bookingController.getBlocksForBooking
);

router.get(
  '/options/rooms',
  authenticate,
  authorize('student'),
  bookingController.getRoomsForBooking
);

router.get(
  '/options/beds',
  authenticate,
  authorize('student'),
  bookingController.getBedsForBooking
);

router.post('/keep-bed', authenticate, authorize('student'), bookingController.keepBed);

// Soft lock routes (must be before /:id)
router.get('/beds/soft-locks', authenticate, authorize('student'), bookingController.getSoftLockedBeds);
router.post('/beds/soft-lock', authenticate, authorize('student'), bookingController.softLockBed);
router.delete('/beds/soft-lock/:bedId', authenticate, authorize('student'), bookingController.softUnlockBed);

router.post('/', authenticate, authorize('student'), bookingController.submitBooking);

router.get(
  '/:id/payment-status',
  authenticate,
  authorize('student'),
  bookingController.checkPaymentStatus
);

router.post(
  '/:id/payos-link',
  authenticate,
  authorize('student'),
  bookingController.createPayosLinkForBooking
);

router.get('/my', authenticate, authorize('student'), bookingController.getMyBookings);

router.get('/:id/roommates', authenticate, authorize('student'), bookingController.getRoommates);

router.patch('/:id/cancel', authenticate, authorize('student'), bookingController.cancelBooking);

// ─── Manager endpoints ───

router.post('/:id/send-email', authenticate, authorize('manager'), bookingController.sendEmailToStudent);
router.post('/send-email-all', authenticate, authorize('manager'), bookingController.sendEmailToAllStudents);

router.get('/', authenticate, authorize('manager'), bookingController.getAllBookings);

router.get(
  '/cfd-at-risk',
  authenticate,
  authorize('manager'),
  bookingController.listCfdAtRiskStudents
);

router.post(
  '/cfd-expel',
  authenticate,
  authorize('manager'),
  bookingController.cfdDormExpelStudent
);

router.get(
  '/checkout/search',
  authenticate,
  authorize('manager'),
  bookingController.searchStudentForCheckout
);

router.post(
  '/checkout',
  authenticate,
  authorize('manager'),
  bookingController.checkoutStudent
);

module.exports = router;
