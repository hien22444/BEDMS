const { News } = require('../models');

/**
 * Build MongoDB filter for news list
 */
const buildNewsFilter = (query = {}, forStudent = false) => {
  const { category, search, is_published } = query;
  const filter = {};

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  if (forStudent) {
    // Students should only see published news
    filter.is_published = true;
  } else if (typeof is_published !== 'undefined') {
    // For manager, allow explicit filter on is_published
    if (is_published === 'true' || is_published === true) {
      filter.is_published = true;
    } else if (is_published === 'false' || is_published === false) {
      filter.is_published = false;
    }
  }

  return filter;
};

/**
 * Get list of news with pagination
 */
const getNewsList = async (query = {}, forStudent = false) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = buildNewsFilter(query, forStudent);

  const [items, total] = await Promise.all([
    News.find(filter).sort({ published_at: -1, createdAt: -1 }).skip(skip).limit(limit),
    News.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get a single news by ID
 */
const getNewsById = async (id, forStudent = false) => {
  const news = await News.findById(id);

  if (!news) {
    throw new Error('News not found');
  }

  if (forStudent && !news.is_published) {
    throw new Error('News not found');
  }

  return news;
};

/**
 * Create a news item
 */
const createNews = async (body) => {
  const now = new Date();

  const isPublished = typeof body.is_published === 'boolean' ? body.is_published : true;

  const news = await News.create({
    title: body.title,
    content: body.content,
    thumbnail_url: body.thumbnail_url || undefined,
    category: body.category || 'general',
    is_published: isPublished,
    published_at: isPublished ? now : null,
  });

  return news.toJSON();
};

/**
 * Update a news item
 */
const updateNews = async (id, body) => {
  const news = await News.findById(id);

  if (!news) {
    throw new Error('News not found');
  }

  if (typeof body.title !== 'undefined') {
    news.title = body.title;
  }
  if (typeof body.content !== 'undefined') {
    news.content = body.content;
  }
  if (typeof body.thumbnail_url !== 'undefined') {
    news.thumbnail_url = body.thumbnail_url;
  }
  if (typeof body.category !== 'undefined') {
    news.category = body.category;
  }

  if (typeof body.is_published === 'boolean') {
    // When switching to published, set published_at if not set
    if (body.is_published && !news.is_published) {
      news.is_published = true;
      news.published_at = new Date();
    } else if (!body.is_published) {
      news.is_published = false;
      news.published_at = null;
    }
  }

  await news.save();

  return news.toJSON();
};

/**
 * Delete a news item
 */
const deleteNews = async (id) => {
  const news = await News.findById(id);

  if (!news) {
    throw new Error('News not found');
  }

  await news.deleteOne();

  return { message: 'News deleted successfully' };
};

module.exports = {
  getNewsList,
  getNewsById,
  createNews,
  updateNews,
  deleteNews,
};
