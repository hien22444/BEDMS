const express = require('express');

const { authenticate, authorize } = require('../../middleware/auth');
const { userController } = require('../../controllers');
const { uploadExcel } = require('../../middleware/upload');

const router = express.Router();

// Admin only — view all users
router.route('/').get(authenticate, authorize('admin'), userController.getAllUsers);

// Admin only — import users from Excel
router
  .route('/import-excel')
  .post(authenticate, authorize('admin'), uploadExcel, userController.importExcel);

// Admin only — delete user
router.route('/:id').delete(authenticate, authorize('admin'), userController.deleteUser);

module.exports = router;
