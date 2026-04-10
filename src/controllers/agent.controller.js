const { agentService, dormRulesService } = require('../services');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

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
  await dormRulesService.updateDormRulesKB(req.user.id, { rules, knowledge_base, system_instructions });
  res.success({ message: 'Dorm rules updated successfully' });
});

module.exports = {
  answer,
  getDormRules,
  updateDormRules,
};
