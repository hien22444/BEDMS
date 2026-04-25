const { status } = require('http-status');
const { agentService, dormRulesService, dormRuleFileService } = require('../services');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const answer = catchAsync(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.flushHeaders();

  const stream$ = await agentService.answer(req.body, req.user.id);
  const subscription = stream$.subscribe({
    next: (chunk) => {
      const payload = typeof chunk === 'string' ? { content: chunk } : chunk || {};
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    error: (error) => {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: error.message || 'Streaming failed' })}\n\n`
      );
      res.end();
    },
    complete: () => {
      if (!res.writableEnded) {
        res.write('event: done\ndata: [DONE]\n\n');
      }
      res.end();
    },
  });

  req.on('close', () => {
    subscription.unsubscribe();
    if (!res.writableEnded) {
      res.end();
    }
  });
});

const getDormRules = catchAsync(async (req, res) => {
  const kb = await dormRulesService.getDormRulesKnowledgeBase();
  res.success(kb);
});

const updateDormRules = catchAsync(async (req, res) => {
  const { rules, knowledge_base, system_instructions } = req.body;
  if (!Array.isArray(rules)) {
    throw new AppError('rules must be an array', 400);
  }
  await dormRulesService.updateDormRulesKB(req.user.id, {
    rules,
    knowledge_base,
    system_instructions,
  });
  res.success({ message: 'Dorm rules updated successfully' });
});

const getDormRuleFiles = catchAsync(async (_req, res) => {
  const items = await dormRuleFileService.listDormRuleFiles();
  res.success({ items }, status.OK);
});

const getDormRuleFileAccessUrl = catchAsync(async (req, res) => {
  const attachment = ['true', '1', 'yes'].includes(String(req.query.attachment || '').toLowerCase());
  const url = await dormRuleFileService.getDormRuleFileAccessUrl(req.params.id, attachment);
  res.success({ url }, status.OK);
});

const downloadDormRuleFile = catchAsync(async (req, res) => {
  const file = await dormRuleFileService.getDormRuleFileById(req.params.id);
  if (!file) {
    throw new AppError('Dorm rule file not found', 404);
  }

  const url = await dormRuleFileService.getDormRuleFileAccessUrl(req.params.id, false);
  const upstream = await fetch(url);

  if (!upstream.ok || !upstream.body) {
    throw new AppError('Failed to download dorm rule file', upstream.status || 500);
  }

  const contentType = upstream.headers.get('content-type') || file.mime_type || 'application/octet-stream';
  const contentLength = upstream.headers.get('content-length');
  const fileName = String(file.original_name || 'dorm-rule-file').replace(/"/g, '\\"');
  const disposition = `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(file.original_name || 'dorm-rule-file')}`;

  res.status(status.OK);
  res.setHeader('Content-Type', contentType);
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('Cache-Control', 'no-store');

  await pipeline(Readable.fromWeb(upstream.body), res);
});

const uploadDormRuleFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('Dorm rule file is required', 400);
  }

  const file = await dormRuleFileService.uploadDormRuleFile(req.user.id, req.file);
  res.success(file, status.CREATED);
});

const featureDormRuleFile = catchAsync(async (req, res) => {
  const file = await dormRuleFileService.setDormRuleFileFeatured(req.params.id);
  res.success(file, status.OK);
});

const deleteDormRuleFile = catchAsync(async (req, res) => {
  const result = await dormRuleFileService.deleteDormRuleFile(req.params.id);
  res.success(result, status.OK);
});

module.exports = {
  answer,
  getDormRules,
  updateDormRules,
  getDormRuleFiles,
  getDormRuleFileAccessUrl,
  downloadDormRuleFile,
  uploadDormRuleFile,
  featureDormRuleFile,
  deleteDormRuleFile,
};
