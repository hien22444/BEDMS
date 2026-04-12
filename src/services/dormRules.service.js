const { SystemConfig } = require('../models');

const CONFIG_KEY = 'dorm_rules_kb';

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
    'Cổng ký túc xá mở từ 05:30 đến 22:00. Sinh viên cần về trước 22:00 nếu không có phê duyệt của ban quản lý.',
  'KTX-GUEST-POLICY':
    'Khách phải xuất trình giấy tờ tại quầy bảo vệ. Khách không được ở lại ký túc xá sau 22:00.',
  'KTX-COOKING':
    'Nấu ăn trong phòng ký túc xá bị nghiêm cấm. Không được mang bếp hoặc thiết bị nấu ăn vào phòng.',
  'KTX-SMOKING-ALCOHOL':
    'Cấm hút thuốc, rượu bia, thuốc lá điện tử trong ký túc xá. Chất ma túy bị nghiêm cấm và xử lý theo pháp luật.',
  'KTX-PETS': 'Sinh viên không được nuôi động vật hoặc thú cưng trong ký túc xá.',
  'KTX-NOISE': 'Không được gây tiếng ồn lớn hoặc làm ảnh hưởng đến sinh viên khác.',
  'KTX-ROOM-CHANGE': 'Không được tự ý đổi phòng/đổi giường nếu chưa có phép của ban quản lý.',
  'KTX-ALLOWED-DEVICES': 'Sinh viên chỉ được mang các thiết bị điện nằm trong danh mục cho phép.',
  'KTX-FIRE-SAFETY':
    'Cấm mang các chất dễ cháy nổ như xăng dầu, bình gas hoặc vật liệu gây nổ vào ký túc xá.',
};

const toText = (value) => String(value || '').trim();

const normalize = (text = '') =>
  toText(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text = '') => normalize(text).split(' ').filter(Boolean);

const detectPreferredLanguage = (text = '') => {
  const raw = text || '';
  if (
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/u.test(
      raw
    )
  ) {
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
  const viHits = viSignals.reduce(
    (acc, signal) => acc + (normalized.includes(signal) ? 1 : 0),
    0
  );

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

const selectCandidateRules = (question, rules = []) => {
  return rules
    .map((rule) => {
      const metrics = scoreRule(question, rule);
      return { ...rule, ...metrics };
    })
    .filter((rule) => rule.score >= 4 && (rule.keywordHits > 0 || rule.tokenHits >= 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};

const isOverviewQuestion = (question = '') => {
  const q = normalize(question);
  const overviewSignals = [
    'what are the dorm rules',
    'what are the rules',
    'tell me the rules',
    'tell me all about the rules',
    'tell me all the rules',
    'give me the rules',
    'give me all the rules',
    'give me full rules',
    'show me the rules',
    'show me all rules',
    'list all rules',
    'overview',
    'summary',
    'all rules',
    'full rules',
    'full dorm rules',
    'dorm rules',
    'dormitory rules',
    'regulation overview',
    'tong quan',
    'tom tat',
    'toan bo noi quy',
    'tat ca noi quy',
    'liet ke noi quy',
    'noi quy chung',
  ];

  return overviewSignals.some((signal) => q.includes(signal));
};

const isFollowUpQuestion = (question = '') => {
  const q = normalize(question);
  const followUpSignals = [
    'is that all',
    'is this all',
    'anything else',
    'what else',
    'more rules',
    'more details',
    'tell me more',
    'anything more',
    'is there anything else',
    'that all',
    'all of them',
  ];

  return followUpSignals.some((signal) => q.includes(signal));
};

const defaultUnknownAnswer = (isVietnamese) =>
  isVietnamese
    ? 'Mình chưa tìm thấy nội dung này trong nội quy hiện tại. Nếu muốn, mình có thể tóm tắt toàn bộ nội quy hoặc đi vào từng mục chi tiết.'
    : 'I could not find that in the current dormitory regulations. If you want, I can summarize all the rules or explain a specific one.';

const buildFollowUpAnswer = (isVietnamese) =>
  isVietnamese
    ? 'Đó là những nội quy hiện tại mà mình có trong cơ sở dữ liệu. Nếu bạn muốn, mình có thể tóm tắt theo chủ đề hoặc giải thích từng mục chi tiết hơn.'
    : 'Yes, those are the current dormitory rules I have on file. If you want, I can group them by topic or explain any rule in more detail.';

const formatPenalty = (penalty, isVietnamese) => {
  if (!penalty) return '';

  const fine =
    typeof penalty.fine_vnd === 'number'
      ? `${new Intl.NumberFormat('vi-VN').format(penalty.fine_vnd)} VND`
      : null;

  if (isVietnamese) {
    const parts = [];
    if (fine) parts.push(`Mức phạt: ${fine}`);
    if (penalty.description) parts.push(penalty.description);
    if (penalty.repeat_penalty) parts.push(`Tái phạm: ${penalty.repeat_penalty}`);
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
        ? `Thiết bị được phép: ${rule.allowed_devices.join(', ')}.`
        : `Allowed devices: ${rule.allowed_devices.join(', ')}.`
    );
  }

  const penalty = formatPenalty(rule.penalty, isVietnamese);
  if (penalty) answerParts.push(penalty);

  return answerParts.join(' ');
};

const buildOverviewFallbackAnswer = (isVietnamese, rules = []) => {
  const highlights = rules
    .map((rule) => {
      const summary = isVietnamese ? RULE_SUMMARY_VI[rule.id] || rule.rule : rule.rule;
      return `- ${rule.title}: ${summary}`;
    })
    .join('\n');

  if (isVietnamese) {
    return [
      'Đây là các nội quy ký túc xá hiện tại mà mình có trong cơ sở dữ liệu:',
      highlights,
      'Nếu bạn muốn, mình có thể giải thích chi tiết từng mục hoặc tóm tắt ngắn hơn theo chủ đề.',
    ].join('\n');
  }

  return [
    'Here are the current dormitory rules I have on file:',
    highlights,
    'If you want, I can break down each section or give you a shorter topic-by-topic summary.',
  ].join('\n');
};

const getDormRulesKnowledgeBase = async () => {
  const config = await SystemConfig.findOne({ config_key: CONFIG_KEY }).lean();

  if (!config?.config_value) {
    return null;
  }

  try {
    const parsed = JSON.parse(config.config_value);
    if (!parsed || !Array.isArray(parsed.rules)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const queryRules = async (question) => {
  const kb = await getDormRulesKnowledgeBase();
  const q = typeof question === 'string' ? question.trim() : '';

  if (!kb) {
    return {
      answer: 'Dormitory rules are not configured yet.',
      matched_rules: [],
      source: null,
      confidence: 'low',
      knowledge_base_found: false,
    };
  }

  const language = detectPreferredLanguage(q);
  const isVietnamese = language === 'vi';

  if (!q) {
    return {
      answer: isVietnamese
        ? 'Vui lòng nhập câu hỏi. Mình có thể hỗ trợ về nội quy ký túc xá.'
        : 'Please provide a question about dormitory regulations.',
      matched_rules: [],
      source: kb.knowledge_base || null,
      confidence: 'low',
      knowledge_base_found: true,
    };
  }

  if (isFollowUpQuestion(q)) {
    return {
      answer: buildFollowUpAnswer(isVietnamese),
      matched_rules: [],
      source: kb.knowledge_base || null,
      confidence: 'medium',
      knowledge_base_found: true,
    };
  }

  const candidates = selectCandidateRules(q, kb.rules);
  const useFullContext = isOverviewQuestion(q) || candidates.length === 0;
  const contextRules = useFullContext ? kb.rules : candidates;

  if (isOverviewQuestion(q)) {
    return {
      answer: buildOverviewFallbackAnswer(isVietnamese, contextRules),
      matched_rules: contextRules.map((rule) => ({
        id: rule.id,
        category: rule.category,
        title: rule.title,
        rule: rule.rule,
        details: rule.details || null,
        allowed_devices: rule.allowed_devices || null,
        penalty: rule.penalty || null,
        score: typeof rule.score === 'number' ? rule.score : 0,
      })),
      source: kb.knowledge_base || null,
      confidence: 'medium',
      knowledge_base_found: true,
    };
  }

  if (candidates.length === 0) {
    return {
      answer: defaultUnknownAnswer(isVietnamese),
      matched_rules: [],
      source: kb.knowledge_base || null,
      confidence: 'low',
      knowledge_base_found: true,
    };
  }

  return {
    answer: buildGroundedFallbackAnswer(candidates[0], isVietnamese),
    matched_rules: contextRules.map((rule) => ({
      id: rule.id,
      category: rule.category,
      title: rule.title,
      rule: rule.rule,
      details: rule.details || null,
      allowed_devices: rule.allowed_devices || null,
      penalty: rule.penalty || null,
      score: typeof rule.score === 'number' ? rule.score : 0,
    })),
    source: kb.knowledge_base || null,
    confidence: candidates[0].score >= 12 ? 'high' : candidates[0].score >= 7 ? 'medium' : 'low',
    knowledge_base_found: true,
  };
};

const updateDormRulesKB = async (adminId, kbData) => {
  await SystemConfig.findOneAndUpdate(
    { config_key: CONFIG_KEY },
    {
      config_key: CONFIG_KEY,
      config_value: JSON.stringify(kbData),
      description: 'Dormitory rules knowledge base for the assistant',
      value_type: 'json',
      updated_by: adminId,
      updated_at: new Date(),
    },
    { upsert: true, new: true }
  );
};

module.exports = {
  queryRules,
  getDormRulesKnowledgeBase,
  updateDormRulesKB,
};
