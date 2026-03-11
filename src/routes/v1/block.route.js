const express = require('express');

const { authenticate, authorize } = require('../../middleware/auth');
const blockController = require('../../controllers/block.controller');

const router = express.Router();

// All routes require authentication and admin role
router
  .route('/')
  .get(authenticate, authorize('admin', 'manager'), blockController.getAllBlocks)
  .post(authenticate, authorize('admin', 'manager'), blockController.createBlock);

router
  .route('/:id')
  .get(authenticate, authorize('admin', 'manager'), blockController.getBlockById)
  .patch(authenticate, authorize('admin', 'manager'), blockController.updateBlock)
  .delete(authenticate, authorize('admin', 'manager'), blockController.deleteBlock);

module.exports = router;
