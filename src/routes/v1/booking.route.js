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

router.post('/', authenticate, authorize('student'), bookingController.submitBooking);

router.get(
  '/:id/payment-status',
  authenticate,
  authorize('student'),
  bookingController.checkPaymentStatus
);

router.get('/my', authenticate, authorize('student'), bookingController.getMyBookings);

router.get('/:id/roommates', authenticate, authorize('student'), bookingController.getRoommates);

router.patch('/:id/cancel', authenticate, authorize('student'), bookingController.cancelBooking);

// ─── Manager endpoints ───

router.get('/', authenticate, authorize('manager'), bookingController.getAllBookings);

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
