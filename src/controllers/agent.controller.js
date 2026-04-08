const { agentService } = require('../services');
const catchAsync = require('../utils/catchAsync');

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

module.exports = {
  answer,
};
