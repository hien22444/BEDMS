/* global jest, describe, beforeEach, afterAll, it, expect */

jest.mock('../models', () => ({
  SystemConfig: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('./openai.service', () => ({
  completion: jest.fn(),
}));

const dormRulesKb = require('../seeds/dormRulesKnowledgeBase');
const { SystemConfig } = require('../models');
const openaiService = require('./openai.service');
const dormRulesService = require('./dormRules.service');

const mockStoredKnowledgeBase = () => {
  SystemConfig.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      config_value: JSON.stringify(dormRulesKb),
    }),
  });
};

const countMarkdownBullets = (content) =>
  String(content || '')
    .split('\n')
    .filter((line) => line.startsWith('- ')).length;

describe('dormRulesService.queryRules', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoredKnowledgeBase();
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it('returns a short grouped overview for broad English rule questions', async () => {
    const result = await dormRulesService.queryRules('What are the dorm rules?');

    expect(result.mode).toBe('overview');
    expect(result.answer).toContain('[full dorm rules](/student/dorm-rules)');
    expect(result.answer).toContain('**Hours and guests:**');
    expect(result.answer).toContain('Ask me about guests, cooking, late return');
    expect(countMarkdownBullets(result.answer)).toBeLessThanOrEqual(7);
    expect(countMarkdownBullets(result.answer)).toBeLessThan(dormRulesKb.rules.length);
  });

  it('detects Vietnamese no-accent overview requests', async () => {
    const result = await dormRulesService.queryRules('noi quy ktx');

    expect(result.mode).toBe('overview');
    expect(result.answer).toContain('[toàn bộ nội quy ký túc xá](/student/dorm-rules)');
    expect(result.answer).toContain('**Giờ giấc và khách:**');
    expect(result.answer).toContain('Bạn có thể hỏi mình');
  });

  it('answers cooking questions with the matched rule and penalty', async () => {
    const result = await dormRulesService.queryRules('Can I cook in my room?');

    expect(result.mode).toBe('specific');
    expect(result.matched_rules[0].id).toBe('KTX-COOKING');
    expect(result.answer).toContain('**Cooking in the dormitory**');
    expect(result.answer).toContain(
      'Cooking in the dormitory and bringing or using cooking equipment'
    );
    expect(result.answer).toContain('Penalty:');
  });

  it('answers Vietnamese late-return questions with the curfew rule and penalty', async () => {
    const result = await dormRulesService.queryRules('Em về sau 22h có bị phạt không?');

    expect(result.mode).toBe('specific');
    expect(result.matched_rules[0].id).toBe('KTX-OPENING-HOURS');
    expect(result.answer).toContain('**Giờ mở cửa ký túc xá**');
    expect(result.answer).toContain('05:30');
    expect(result.answer).toContain('Mức phạt');
  });

  it('returns all rules grouped by section for explicit full-list requests', async () => {
    const result = await dormRulesService.queryRules('Show me all dorm rules');

    expect(result.mode).toBe('full');
    expect(result.answer).toContain('## General');
    expect(result.answer).toContain('## Room and payment');
    expect(countMarkdownBullets(result.answer)).toBe(dormRulesKb.rules.length);
  });

  it('falls back to deterministic Markdown when OpenAI rewrite fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    openaiService.completion.mockRejectedValue(new Error('OpenAI unavailable'));

    const result = await dormRulesService.queryRules('What are the dorm rules?');

    expect(openaiService.completion).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe('overview');
    expect(result.answer).toContain('**Hours and guests:**');
    expect(result.answer).toContain('[full dorm rules](/student/dorm-rules)');
  });
});
