const dormRulesKb = require('../data/dormRules.json');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const RULE_SYNONYMS_VI = {
  'KTX-OPENING-HOURS': ['gio dong cua', 'gio mo cua', 'gio nghiem', 've tre', 'sau 22h'],
  'KTX-GUEST-POLICY': ['khach', 'ban den choi', 'ngu qua dem', 'khach o lai'],
  'KTX-COOKING': ['nau an', 'bep', 'noi lau', 'hotpot'],
  'KTX-SMOKING-ALCOHOL': [
    'hut thuoc',
    'thuoc la',
    'ruou',
    'bia',
    'chat kich thich',
    'ma tuy',
    'thuoc dien tu',
    'vape',
  ],
  'KTX-PETS': ['thu cung', 'cho', 'meo', 'dong vat'],
  'KTX-NOISE': ['on ao', 'gay on', 'mo nhac to', 'party'],
  'KTX-ROOM-CHANGE': ['doi phong', 'chuyen phong', 'doi giuong', 'hoan doi phong'],
  'KTX-ALLOWED-DEVICES': ['thiet bi dien', 'do dien', 'duoc mang', 'tu lanh'],
  'KTX-FIRE-SAFETY': ['phong chay', 'chat de chay', 'binh gas', 'xang dau', 'chat no'],
};

const RULE_SUMMARY_VI = {
  'KTX-OPENING-HOURS':
    'Dormitory gates are open from 05:30 to 22:00. Students must return before 22:00 unless they have approval from management.',
  'KTX-GUEST-POLICY':
    'Guests must present identification at the security desk. Guests are not allowed to stay in the dormitory after 22:00.',
  'KTX-COOKING':
    'Cooking inside dorm rooms is strictly prohibited. Stoves and cooking appliances are not allowed in rooms.',
  'KTX-SMOKING-ALCOHOL':
    'Smoking, alcohol, and e-cigarettes are prohibited in the dormitory. Illegal drugs are strictly forbidden and handled according to the law.',
  'KTX-PETS': 'Students are not allowed to keep animals or pets in the dormitory.',
  'KTX-NOISE': 'Students must not create loud noise or disturb other residents.',
  'KTX-ROOM-CHANGE': 'Room or bed changes are not allowed without management approval.',
  'KTX-ALLOWED-DEVICES': 'Students may only bring electrical devices that are on the approved list.',
  'KTX-FIRE-SAFETY':
    'Flammable or explosive materials such as gasoline, gas cylinders, or explosive substances are prohibited in the dormitory.',
};

const normalize = (text = '') =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text = '') => normalize(text).split(' ').filter(Boolean);

const detectPreferredLanguage = (text = '') => {
  const raw = text || '';
  if (/[\u00E0\u00E1\u1EA1\u1EA3\u00E3\u00E2\u1EA7\u1EA5\u1EAD\u1EA9\u1EAB\u0103\u1EB1\u1EAF\u1EB7\u1EB3\u1EB5\u00E8\u00E9\u1EB9\u1EBB\u1EBD\u00EA\u1EC1\u1EBF\u1EC7\u1EC3\u1EC5\u00EC\u00ED\u1ECB\u1EC9\u0129\u00F2\u00F3\u1ECD\u1ECF\u00F5\u00F4\u1ED3\u1ED1\u1ED9\u1ED5\u1ED7\u01A1\u1EDD\u1EDB\u1EE3\u1EDF\u1EE1\u00F9\u00FA\u1EE5\u1EE7\u0169\u01B0\u1EEB\u1EE9\u1EF1\u1EED\u1EEF\u1EF3\u00FD\u1EF5\u1EF7\u1EF9\u0111]/u.test(raw)) {
    return 'vi';
  }

  const normalized = normalize(text);
  const englishSignals = [
    'hello',
    'hi',
    'how are you',
    'what',
    'when',
    'where',
    'can i',
    'is it',
    'allowed',
    'rules',
    'policy',
    'guest',
    'dorm',
    'room',
    'smoke',
    'cook',
    'overview',
    'regulation',
  ];
  const viSignals = [
    'xin chao',
    'chao',
    'em',
    'anh',
    'chi',
    'ban',
    'khong',
    'duoc',
    'ktx',
    'noi quy',
    'quy dinh',
    'phong',
    'giuong',
    'khach',
    'nau an',
    'thu cung',
    'tong quan',
  ];

  const englishHits = englishSignals.reduce(
    (acc, signal) => acc + (normalized.includes(signal) ? 1 : 0),
    0
  );
  const viHits = viSignals.reduce((acc, signal) => acc + (normalized.includes(signal) ? 1 : 0), 0);

  if (englishHits > viHits) return 'en';
  if (viHits > englishHits) return 'vi';

  const isAsciiOnly = Array.from(raw).every((char) => char.charCodeAt(0) <= 127);
  return isAsciiOnly ? 'en' : 'vi';
};

const buildRuleSearchText = (rule) => {
  const fields = [
    rule.title,
    rule.rule,
    rule.details,
    ...(rule.keywords || []),
    ...(rule.example_questions || []),
    ...(rule.allowed_devices || []),
    ...(RULE_SYNONYMS_VI[rule.id] || []),
  ];
  return normalize(fields.filter(Boolean).join(' '));
};

const scoreRule = (question, rule) => {
  const qNormalized = normalize(question);
  const qTokens = tokenize(question);
  const searchText = buildRuleSearchText(rule);
  const searchTokens = new Set(searchText.split(' '));

  let score = 0;
  let keywordHits = 0;
  let tokenHits = 0;

  const keywords = [...(rule.keywords || []), ...(RULE_SYNONYMS_VI[rule.id] || [])];
  for (const kw of keywords) {
    const keyword = normalize(kw);
    if (!keyword) continue;
    if (qNormalized.includes(keyword)) {
      score += 8;
      keywordHits += 1;
    }
  }

  for (const token of qTokens) {
    if (searchTokens.has(token)) {
      score += 1;
      tokenHits += 1;
    }
  }

  for (const sample of rule.example_questions || []) {
    const sampleNormalized = normalize(sample);
    if (sampleNormalized && qNormalized.includes(sampleNormalized)) {
      score += 10;
    }
  }

  return { score, keywordHits, tokenHits };
};

const selectCandidateRules = (question) => {
  const scoredRules = dormRulesKb.rules
    .map((rule) => {
      const metrics = scoreRule(question, rule);
      return { ...rule, ...metrics };
    })
    .filter((rule) => rule.score >= 4 && (rule.keywordHits > 0 || rule.tokenHits >= 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scoredRules;
};

const isOverviewQuestion = (question = '') => {
  const q = normalize(question);
  const overviewSignals = [
    'overview',
    'summary',
    'all rules',
    'regulation overview',
    'tong quan',
    'tom tat',
    'toan bo noi quy',
    'noi quy chung',
  ];
  return overviewSignals.some((signal) => q.includes(signal));
};

const defaultUnknownAnswer = (isVietnamese) =>
  isVietnamese
    ? 'I do not have this information in the current dormitory regulations.'
    : 'I do not have this information in the current dormitory regulations.';

const formatPenalty = (penalty, isVietnamese) => {
  if (!penalty) return '';
  const fine =
    typeof penalty.fine_vnd === 'number'
      ? `${new Intl.NumberFormat('vi-VN').format(penalty.fine_vnd)} VND`
      : null;

  if (isVietnamese) {
    const parts = [];
    if (fine) parts.push(`Penalty: ${fine}`);
    if (penalty.description) parts.push(penalty.description);
    if (penalty.repeat_penalty) parts.push(`Repeat violation: ${penalty.repeat_penalty}`);
    return parts.join('. ');
  }

  const parts = [];
  if (fine) parts.push(`Penalty: ${fine}`);
  if (penalty.description) parts.push(penalty.description);
  if (penalty.repeat_penalty) parts.push(`Repeat violation: ${penalty.repeat_penalty}`);
  return parts.join('. ');
};

const buildGroundedFallbackAnswer = (rule, isVietnamese) => {
  if (!rule) return defaultUnknownAnswer(isVietnamese);
  const answerParts = [isVietnamese ? RULE_SUMMARY_VI[rule.id] || rule.rule : rule.rule];
  if (rule.details && !isVietnamese) answerParts.push(rule.details);
  if (Array.isArray(rule.allowed_devices) && rule.allowed_devices.length > 0) {
    answerParts.push(
      isVietnamese
        ? `Allowed devices: ${rule.allowed_devices.join(', ')}.`
        : `Allowed devices: ${rule.allowed_devices.join(', ')}.`
    );
  }
  const penalty = formatPenalty(rule.penalty, isVietnamese);
  if (penalty) answerParts.push(penalty);
  return answerParts.join(' ');
};

const buildOverviewFallbackAnswer = (isVietnamese) => {
  if (isVietnamese) {
    return (
      'Regulation overview: (1) Gate hours are 05:30 to 22:00. ' +
      '(2) Guests must show ID and cannot stay after 22:00. ' +
      '(3) Cooking in rooms is prohibited; smoking, alcohol, and illegal drugs are prohibited; pets are not allowed. ' +
      '(4) No loud disturbances and no room changes without permission. ' +
      '(5) Only approved electrical devices are allowed. ' +
      '(6) Flammable or explosive materials are prohibited. ' +
      'If you want, I can break down each section with penalties.'
    );
  }

  return (
    'Regulation overview: (1) Gate hours are 05:30 to 22:00. ' +
    '(2) Guests must show ID and cannot stay after 22:00. ' +
    '(3) Cooking in rooms is prohibited; smoking/alcohol/drugs are prohibited; pets are not allowed. ' +
    '(4) No loud disturbance and no room changes without permission. ' +
    '(5) Only approved electrical devices are allowed. ' +
    '(6) Flammable or explosive materials are prohibited. ' +
    'If you want, I can break down each section with penalties.'
  );
};

const askOpenAI = async ({ question, contextRules, language }) => {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch API is unavailable in this runtime');
  }
  if (typeof globalThis.AbortController !== 'function') {
    throw new Error('AbortController is unavailable in this runtime');
  }

  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are Dormitory Rules Assistant (Phase 1). ' +
              'Be conversational and helpful. ' +
              'Always respond in English. ' +
              'For regulation facts, use ONLY provided rules context and do not invent. ' +
              'If user asks for regulation overview, provide a detailed structured summary covering major sections. ' +
              'If user is just greeting/smalltalk, reply naturally and guide them to dorm regulation help. ' +
              'If regulation info is missing, say you do not have that information in current regulations. ' +
              'Return strict JSON keys: intent, answer, is_regulation_in_scope, matched_rule_ids, confidence. ' +
              'intent must be one of: smalltalk, regulation, unknown.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              language,
              question,
              context_rules: contextRules.map((rule) => ({
                id: rule.id,
                title: rule.title,
                category: rule.category,
                rule: rule.rule,
                details: rule.details || null,
                allowed_devices: rule.allowed_devices || null,
                penalty: rule.penalty || null,
              })),
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errText}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI empty response');

    const parsed = JSON.parse(content);
    return {
      intent:
        parsed.intent === 'smalltalk' ||
        parsed.intent === 'regulation' ||
        parsed.intent === 'unknown'
          ? parsed.intent
          : 'unknown',
      answer: typeof parsed.answer === 'string' ? parsed.answer.trim() : '',
      is_regulation_in_scope: Boolean(parsed.is_regulation_in_scope),
      matched_rule_ids: Array.isArray(parsed.matched_rule_ids) ? parsed.matched_rule_ids : [],
      confidence:
        parsed.confidence === 'high' ||
        parsed.confidence === 'medium' ||
        parsed.confidence === 'low'
          ? parsed.confidence
          : 'low',
    };
  } finally {
    clearTimeout(timeout);
  }
};

const mapMatchedRules = (candidates, matchedRuleIds = []) => {
  const matchedSet = new Set(matchedRuleIds);
  const prioritized = matchedRuleIds
    .map((id) => candidates.find((rule) => rule.id === id))
    .filter(Boolean);
  const rest = candidates.filter((rule) => !matchedSet.has(rule.id));
  const ordered = [...prioritized, ...rest];

  return ordered.map((rule) => ({
    id: rule.id,
    category: rule.category,
    title: rule.title,
    rule: rule.rule,
    details: rule.details || null,
    allowed_devices: rule.allowed_devices || null,
    penalty: rule.penalty || null,
    score: typeof rule.score === 'number' ? rule.score : 0,
  }));
};

const queryRules = async (question) => {
  const q = typeof question === 'string' ? question.trim() : '';
  const language = detectPreferredLanguage(q);
  const isVietnamese = language === 'vi';

  if (!q) {
    return {
      answer: isVietnamese
        ? 'Please provide a question. I can help with dormitory regulations.'
        : 'Please provide a question about dormitory regulations.',
      matched_rules: [],
      source: dormRulesKb.knowledge_base,
      confidence: 'low',
    };
  }

  const candidates = selectCandidateRules(q);
  const useFullContext = isOverviewQuestion(q) || candidates.length === 0;
  const contextRules = useFullContext ? dormRulesKb.rules : candidates;

  let aiAnswer = null;
  if (OPENAI_API_KEY) {
    try {
      aiAnswer = await askOpenAI({
        question: q,
        contextRules,
        language,
      });
    } catch {
      aiAnswer = null;
    }
  }

  if (aiAnswer) {
    const safeAnswer =
      aiAnswer.answer ||
      (isVietnamese
        ? 'I am the dormitory regulations assistant. What would you like help with?'
        : 'I am the dormitory regulation assistant. What regulation can I help you with?');

    if (aiAnswer.intent === 'smalltalk') {
      return {
        answer: safeAnswer,
        matched_rules: [],
        source: dormRulesKb.knowledge_base,
        confidence: aiAnswer.confidence || 'high',
      };
    }

    if (aiAnswer.intent === 'regulation' && !aiAnswer.is_regulation_in_scope) {
      return {
        answer: defaultUnknownAnswer(isVietnamese),
        matched_rules: [],
        source: dormRulesKb.knowledge_base,
        confidence: 'low',
      };
    }

    return {
      answer: safeAnswer,
      matched_rules: mapMatchedRules(
        candidates.length > 0 ? candidates : contextRules,
        aiAnswer.matched_rule_ids
      ),
      source: dormRulesKb.knowledge_base,
      confidence: aiAnswer.confidence || 'medium',
    };
  }

  // Fallback only when OpenAI is unavailable/failed.
  if (isOverviewQuestion(q)) {
    return {
      answer: buildOverviewFallbackAnswer(isVietnamese),
      matched_rules: mapMatchedRules(dormRulesKb.rules, []),
      source: dormRulesKb.knowledge_base,
      confidence: 'medium',
    };
  }

  if (candidates.length === 0) {
    return {
      answer: isVietnamese
        ? 'I am the dormitory regulations assistant, ready to help. Which rule would you like to ask about?'
        : "I'm a dormitory regulation assistant, always ready to help. What regulation would you like to ask about?",
      matched_rules: [],
      source: dormRulesKb.knowledge_base,
      confidence: 'low',
    };
  }

  return {
    answer: buildGroundedFallbackAnswer(candidates[0], isVietnamese),
    matched_rules: mapMatchedRules(candidates, []),
    source: dormRulesKb.knowledge_base,
    confidence: candidates[0].score >= 12 ? 'high' : candidates[0].score >= 7 ? 'medium' : 'low',
  };
};

const getAllRules = async () => ({
  source: dormRulesKb.knowledge_base,
  rules: dormRulesKb.rules,
});

module.exports = {
  queryRules,
  getAllRules,
};
