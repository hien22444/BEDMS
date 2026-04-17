const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { newsController } = require('../../controllers');

const router = express.Router();

// List & create news
router
  .route('/')
  // Students and managers can view news list
  .get(authenticate, authorize('student', 'manager'), newsController.getNewsList)
  // Only managers can create news
  .post(authenticate, authorize('manager'), newsController.createNews);

// Single news item operations
router
  .route('/:id')
  // Students and managers can view details
  .get(authenticate, authorize('student', 'manager'), newsController.getNewsById)
  // Only managers can update or delete
  .patch(authenticate, authorize('manager'), newsController.updateNews)
  .delete(authenticate, authorize('manager'), newsController.deleteNews);

module.exports = router;
