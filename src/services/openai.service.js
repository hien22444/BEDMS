const { OpenAI } = require('openai');
const { Observable } = require('rxjs');

const connect = () => {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

const completion = async ({ model = 'gpt-4.1', ...payload }) => {
  const res = await connect().chat.completions.create({
    model,
    ...payload,
  });

  return res.choices[0].message.content;
};

/**
 *
 * @param {OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming}
 * @returns {Promise<Observable<string>>}
 */
const stream = async ({ model = 'gpt-4.1', ...payload }) => {
  return new Observable(async (subscriber) => {
    const $stream = await connect().chat.completions.create({
      model,
      ...payload,
      stream: true,
    });
    (async () => {
      try {
        for await (const chunk of $stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            subscriber.next(content);
          }
        }
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    })();
  });
};

module.exports = {
  completion,
  connect,
  stream,
};
