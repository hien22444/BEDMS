const { status } = require('http-status');
const { bookingService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const getBookingWindowStatus = catchAsync(async (req, res) => {
  const data = await bookingService.getBookingWindowStatus(req.user.id);
  res.success(data, status.OK);
});

const getNextSemesterInfo = catchAsync(async (req, res) => {
  const data = await bookingService.getNextSemesterInfo(req.user.id);
  res.success(data, status.OK);
});

const getAvailableRoomTypes = catchAsync(async (req, res) => {
  const data = await bookingService.getAvailableRoomTypes(req.user.id);
  res.success(data, status.OK);
});

const getDormsForBooking = catchAsync(async (req, res) => {
  const data = await bookingService.getDormsForBooking(req.user.id, req.query.room_type);
  res.success(data, status.OK);
});

const getFloorsForBooking = catchAsync(async (req, res) => {
  const data = await bookingService.getFloorsForBooking(
    req.user.id,
    req.query.dorm_id,
    req.query.room_type
  );
  res.success(data, status.OK);
});

const getBlocksForBooking = catchAsync(async (req, res) => {
  const data = await bookingService.getBlocksForBooking(
    req.user.id,
    req.query.dorm_id,
    req.query.floor,
    req.query.room_type
  );
  res.success(data, status.OK);
});

const getRoomsForBooking = catchAsync(async (req, res) => {
  const data = await bookingService.getRoomsForBooking(
    req.user.id,
    req.query.block_id,
    req.query.room_type
  );
  res.success(data, status.OK);
});

const getBedsForBooking = catchAsync(async (req, res) => {
  const data = await bookingService.getBedsForBooking(req.user.id, req.query.room_id);
  res.success(data, status.OK);
});

const submitBooking = catchAsync(async (req, res) => {
  const data = await bookingService.submitBooking(req.user.id, req.body);
  res.success(data, status.CREATED);
});

const checkPaymentStatus = catchAsync(async (req, res) => {
  const data = await bookingService.checkPaymentStatus(req.params.id, req.user.id);
  res.success(data, status.OK);
});

const getMyBookings = catchAsync(async (req, res) => {
  const data = await bookingService.getMyBookings(req.user.id, req.query);
  res.success(data, status.OK);
});

const cancelBooking = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await bookingService.cancelBooking(req.params.id, req.user.id, io);
  res.success(data, status.OK);
});

const keepBed = catchAsync(async (req, res) => {
  const data = await bookingService.keepBed(req.user.id);
  res.success(data, status.CREATED);
});

const getAllBookings = catchAsync(async (req, res) => {
  const data = await bookingService.getAllBookings(req.query);
  res.success(data, status.OK);
});

const searchStudentForCheckout = catchAsync(async (req, res) => {
  const data = await bookingService.searchStudentForCheckout(req.query.student_code);
  res.success(data, status.OK);
});

const checkoutStudent = catchAsync(async (req, res) => {
  const data = await bookingService.checkoutStudent(req.body.student_code, req.user.id);
  res.success(data, status.OK);
});

const getRoommates = catchAsync(async (req, res) => {
  const data = await bookingService.getRoommates(req.user.id, req.params.id);
  res.success(data, status.OK);
});

const sendEmailToStudent = catchAsync(async (req, res) => {
  const data = await bookingService.sendEmailToStudent(req.params.id, req.body);
  res.success(data, status.OK);
});

const sendEmailToAllStudents = catchAsync(async (req, res) => {
  const data = await bookingService.sendEmailToAllStudents(req.body);
  res.success(data, status.OK);
});

module.exports = {
  getBookingWindowStatus,
  keepBed,
  getNextSemesterInfo,
  getAvailableRoomTypes,
  getDormsForBooking,
  getFloorsForBooking,
  getBlocksForBooking,
  getRoomsForBooking,
  getBedsForBooking,
  submitBooking,
  checkPaymentStatus,
  getMyBookings,
  cancelBooking,
  sendEmailToStudent,
  sendEmailToAllStudents,
  getAllBookings,
  searchStudentForCheckout,
  checkoutStudent,
  getRoommates,
};
