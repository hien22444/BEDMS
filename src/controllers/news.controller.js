const { status } = require('http-status');
const { newsService } = require('../services');
const catchAsync = require('../utils/catchAsync');

/**
 * Create a new news item
 */
const createNews = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await newsService.createNews(req.body, io);
  res.success(data, status.CREATED);
});

/**
 * Get list of news
 * - Students: only published news
 * - Managers: can see all news (with optional filters)
 */
const getNewsList = catchAsync(async (req, res) => {
  const role = req.user?.role;
  const forStudent = role === 'student';

  const data = await newsService.getNewsList(req.query, forStudent);
  res.success(data, status.OK);
});

/**
 * Get a single news item
 */
const getNewsById = catchAsync(async (req, res) => {
  const role = req.user?.role;
  const forStudent = role === 'student';

  const data = await newsService.getNewsById(req.params.id, forStudent);
  res.success(data, status.OK);
});

/**
 * Update a news item
 */
const updateNews = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const data = await newsService.updateNews(req.params.id, req.body, io);
  res.success(data, status.OK);
});

/**
 * Delete a news item
 */
const deleteNews = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  await newsService.deleteNews(req.params.id, io);
  res.success({ message: 'News deleted successfully' }, status.OK);
});

module.exports = {
  createNews,
  getNewsList,
  getNewsById,
  updateNews,
  deleteNews,
};
