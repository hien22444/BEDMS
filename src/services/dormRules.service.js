const { SystemConfig } = require('../models');
const { normalize, detectPreferredLanguage } = require('../utils/lang');
const openaiService = require('./openai.service');

const CONFIG_KEY = 'dorm_rules_kb';
const FULL_RULES_URL = '/student/dorm-rules';

const CATEGORY_ORDER = [
  'general',
  'finance',
  'room_management',
  'living_rules',
  'equipment',
  'security',
  'safety',
  'hygiene',
  'health',
];

const CATEGORY_LABELS = {
  general: { en: 'General', vi: 'Quy định chung' },
  finance: { en: 'Room and payment', vi: 'Phòng ở và chi phí' },
  room_management: { en: 'Room management', vi: 'Quản lý phòng ở' },
  living_rules: { en: 'Daily living', vi: 'Sinh hoạt hằng ngày' },
  equipment: { en: 'Devices and assets', vi: 'Thiết bị và tài sản' },
  security: { en: 'Security and conduct', vi: 'An ninh và ứng xử' },
  safety: { en: 'Safety', vi: 'An toàn' },
  hygiene: { en: 'Hygiene', vi: 'Vệ sinh' },
  health: { en: 'Health', vi: 'Y tế' },
};

const OVERVIEW_GROUPS = [
  {
    key: 'hours_guests',
    label_en: 'Hours and guests',
    label_vi: 'Giờ giấc và khách',
    ids: ['KTX-OPENING-HOURS', 'KTX-GUEST-POLICY', 'KTX-ROOM-VISITS-AFTER-2230'],
  },
  {
    key: 'room_payment',
    label_en: 'Room and payment',
    label_vi: 'Phòng ở và chi phí',
    ids: [
      'KTX-SEMESTER-CHECKOUT-RENEWAL',
      'KTX-FEE-DEADLINES',
      'KTX-NO-REFUND',
      'KTX-ROOM-CHANGE',
      'KTX-ROOM-TRANSFER-LEASE',
    ],
  },
  {
    key: 'daily_living',
    label_en: 'Daily living',
    label_vi: 'Sinh hoạt hằng ngày',
    ids: [
      'KTX-COOKING',
      'KTX-SMOKING-ALCOHOL',
      'KTX-NOISE',
      'KTX-PETS',
      'KTX-PARTIES',
      'KTX-GAMBLING',
      'KTX-DRUGS-LAUGHING-GAS',
      'KTX-POSTERS-ADVERTISEMENT',
    ],
  },
  {
    key: 'safety_security',
    label_en: 'Safety and security',
    label_vi: 'An toàn và an ninh',
    ids: [
      'KTX-FIRE-SAFETY',
      'KTX-FIRE-EQUIPMENT',
      'KTX-FIRE-INCIDENT-REPORTING',
      'KTX-FIGHTING-WEAPONS',
      'KTX-LOCK-DOORS',
      'KTX-INSPECTION-COOPERATION',
      'KTX-CLIMBING',
      'KTX-THEFT-DAMAGE',
      'KTX-PARKING',
    ],
  },
  {
    key: 'assets_devices',
    label_en: 'Assets and devices',
    label_vi: 'Tài sản và thiết bị',
    ids: [
      'KTX-ALLOWED-DEVICES',
      'KTX-UNAUTHORIZED-ITEMS',
      'KTX-ELECTRICAL-CONNECTIONS',
      'KTX-ELECTRICITY-WATER',
      'KTX-ASSET-HANDOVER',
      'KTX-ROOM-MODIFICATION-ASSETS',
      'KTX-WALL-DAMAGE',
    ],
  },
  {
    key: 'hygiene_health',
    label_en: 'Hygiene and health',
    label_vi: 'Vệ sinh và sức khỏe',
    ids: [
      'KTX-HYGIENE-COMMON-AREAS',
      'KTX-TRASH',
      'KTX-BALCONY-LAUNDRY',
      'KTX-POLLUTION-ODOR',
      'KTX-HEALTH-DISEASE',
    ],
  },
  {
    key: 'penalties',
    label_en: 'Penalties',
    label_vi: 'Mức xử lý',
    ids: ['KTX-VIOLATION-HANDLING'],
  },
];

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

const tokenize = (text = '') => normalize(text).split(' ').filter(Boolean);

const asArray = (value) => (Array.isArray(value) ? value : []);

const flattenTextValues = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenTextValues);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenTextValues);
  return [String(value)];
};

const pickLocalizedValue = (record = {}, baseKey, isVietnamese) => {
  const preferredKey = isVietnamese ? `${baseKey}_vi` : `${baseKey}_en`;
  const fallbackKey = isVietnamese ? `${baseKey}_en` : `${baseKey}_vi`;

  return record[preferredKey] || record[baseKey] || record[fallbackKey] || '';
};

const pickLocalizedList = (record = {}, baseKey, isVietnamese) => {
  const preferredKey = isVietnamese ? `${baseKey}_vi` : `${baseKey}_en`;
  const fallbackKey = isVietnamese ? `${baseKey}_en` : `${baseKey}_vi`;

  return asArray(record[preferredKey]).length
    ? asArray(record[preferredKey])
    : asArray(record[baseKey]).length
      ? asArray(record[baseKey])
      : asArray(record[fallbackKey]);
};

const getRuleTitle = (rule, isVietnamese) =>
  pickLocalizedValue(rule, 'title', isVietnamese) || rule.id;

const getRuleText = (rule, isVietnamese) =>
  isVietnamese
    ? rule.rule_vi || RULE_SUMMARY_VI[rule.id] || rule.rule || rule.rule_en || ''
    : rule.rule_en || rule.rule || rule.rule_vi || '';

const getRuleDetails = (rule, isVietnamese) => pickLocalizedValue(rule, 'details', isVietnamese);

const collectRuleKeywords = (rule) => [
  ...asArray(rule.keywords),
  ...asArray(rule.keywords_vi),
  ...asArray(rule.keywords_en),
  ...(RULE_SYNONYMS_VI[rule.id] || []),
];

const buildRuleSearchText = (rule) => {
  const fields = [
    rule.title,
    rule.title_vi,
    rule.title_en,
    rule.rule,
    rule.rule_vi,
    rule.rule_en,
    rule.details,
    rule.details_vi,
    rule.details_en,
    rule.source_ref,
    ...collectRuleKeywords(rule),
    ...asArray(rule.example_questions),
    ...asArray(rule.example_questions_vi),
    ...asArray(rule.example_questions_en),
    ...asArray(rule.allowed_devices),
    ...asArray(rule.allowed_devices_vi),
    ...asArray(rule.allowed_devices_en),
    ...flattenTextValues(rule.penalty),
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

  const keywords = collectRuleKeywords(rule);
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

  const samples = [
    ...asArray(rule.example_questions),
    ...asArray(rule.example_questions_vi),
    ...asArray(rule.example_questions_en),
  ];

  for (const sample of samples) {
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

const isFullRulesQuestion = (question = '') => {
  const q = normalize(question);

  const fullSignals = [
    'show full rules',
    'show me full rules',
    'show me all rules',
    'show all rules',
    'show me all dorm rules',
    'show all dorm rules',
    'list all rules',
    'list every rule',
    'list all dorm rules',
    'list all regulations',
    'full list of rules',
    'all rules',
    'full rules',
    'full dorm rules',
    'complete rules',
    'complete dorm rules',
    'entire dorm rules',
    'every dorm rule',
    'all dormitory regulations',
    'toan bo noi quy',
    'toan bo quy dinh',
    'tat ca noi quy',
    'tat ca quy dinh',
    'liet ke tat ca',
    'liet ke toan bo',
    'liet ke day du',
    'liet ke noi quy',
    'danh sach noi quy',
    'day du noi quy',
    'noi quy day du',
  ];

  if (fullSignals.some((signal) => q.includes(signal))) return true;

  const qTokens = new Set(q.split(' ').filter(Boolean));
  const hasFullModifier = ['all', 'full', 'complete', 'entire', 'every'].some((word) =>
    qTokens.has(word)
  );
  const hasRuleTerm =
    ['rule', 'rules', 'regulation', 'regulations'].some((word) => qTokens.has(word)) ||
    ['noi quy', 'quy dinh'].some((word) => q.includes(word));
  const hasVietnameseFullModifier = ['tat ca', 'toan bo', 'day du'].some((word) =>
    q.includes(word)
  );

  return (hasFullModifier || hasVietnameseFullModifier) && hasRuleTerm;
};

const isOverviewQuestion = (question = '') => {
  const q = normalize(question);
  const exactOverviewSignals = [
    'rules',
    'regulations',
    'dorm rules',
    'dormitory rules',
    'dorm regulation',
    'dorm regulations',
    'noi quy',
    'noi quy ktx',
    'ktx',
    'quy dinh',
    'quy dinh ktx',
    'quy dinh ky tuc xa',
    'noi quy chung',
  ];

  if (exactOverviewSignals.includes(q)) return true;

  const overviewSignals = [
    'what are the dorm rules',
    'what are the dormitory rules',
    'what are the rules',
    'what rules should i know',
    'tell me the dorm rules',
    'tell me about dorm rules',
    'give me the dorm rules',
    'show me the dorm rules',
    'summarize dorm rules',
    'summary of dorm rules',
    'overview of dorm rules',
    'regulation overview',
    'dorm rules overview',
    'dormitory rules overview',
    'tong quan noi quy',
    'tom tat noi quy',
    'cho em noi quy',
    'cho minh noi quy',
    'noi quy ktx',
    'noi quy ky tuc xa',
    'quy dinh ktx',
    'quy dinh ky tuc xa',
  ];

  return overviewSignals.some((signal) => q.includes(signal));
};

const getRuleQueryMode = (question = '', candidates = []) => {
  if (isFullRulesQuestion(question)) return 'full';
  if (!isOverviewQuestion(question)) return candidates.length > 0 ? 'specific' : 'unknown';

  const hasSpecificRuleHit = candidates.some((rule) => rule.keywordHits > 0);
  const isExactOverview = [
    'rules',
    'regulations',
    'dorm rules',
    'dormitory rules',
    'noi quy',
    'noi quy ktx',
    'ktx',
    'quy dinh',
    'quy dinh ktx',
  ].includes(normalize(question));

  if (isExactOverview || !hasSpecificRuleHit) return 'overview';
  return candidates.length > 0 ? 'specific' : 'overview';
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

const cleanSentencePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[.!?。]+$/u, '');

const joinPenaltyParts = (parts) => parts.map(cleanSentencePart).filter(Boolean).join('. ');

const formatPenalty = (penalty, isVietnamese) => {
  if (!penalty) return '';

  const fine =
    typeof penalty.fine_vnd === 'number'
      ? `${new Intl.NumberFormat('vi-VN').format(penalty.fine_vnd)} VND`
      : null;

  const localized = (key) => pickLocalizedValue(penalty, key, isVietnamese);

  if (isVietnamese) {
    const parts = [];
    if (fine) parts.push(`Mức phạt: ${fine}`);
    if (localized('amount')) parts.push(`Mức xử lý: ${localized('amount')}`);
    if (localized('description')) parts.push(localized('description'));
    if (localized('first_violation')) parts.push(`Lần 1: ${localized('first_violation')}`);
    if (localized('second_violation')) parts.push(`Lần 2: ${localized('second_violation')}`);
    if (localized('third_violation')) parts.push(`Lần 3: ${localized('third_violation')}`);
    if (localized('repeat_penalty')) parts.push(`Tái phạm: ${localized('repeat_penalty')}`);
    if (localized('additional_action')) parts.push(localized('additional_action'));
    if (localized('compensation')) parts.push(`Bồi thường: ${localized('compensation')}`);
    if (localized('legal_action')) parts.push(`Xử lý pháp lý: ${localized('legal_action')}`);
    if (localized('note')) parts.push(localized('note'));
    return joinPenaltyParts(parts);
  }

  const parts = [];
  if (fine) parts.push(`Penalty: ${fine}`);
  if (localized('amount')) parts.push(`Penalty amount: ${localized('amount')}`);
  if (localized('description')) parts.push(localized('description'));
  if (localized('first_violation')) parts.push(`First violation: ${localized('first_violation')}`);
  if (localized('second_violation'))
    parts.push(`Second violation: ${localized('second_violation')}`);
  if (localized('third_violation')) parts.push(`Third violation: ${localized('third_violation')}`);
  if (localized('repeat_penalty')) parts.push(`Repeat violation: ${localized('repeat_penalty')}`);
  if (localized('additional_action')) parts.push(localized('additional_action'));
  if (localized('compensation')) parts.push(`Compensation: ${localized('compensation')}`);
  if (localized('legal_action')) parts.push(`Legal handling: ${localized('legal_action')}`);
  if (localized('note')) parts.push(localized('note'));
  return joinPenaltyParts(parts);
};

const ensureSentence = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?。]$/u.test(text) ? text : `${text}.`;
};

const firstSentence = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const match = text.match(/^.*?[.!?。](?:\s|$)/u);
  return ensureSentence((match ? match[0] : text).trim());
};

const formatShortPenalty = (penalty, isVietnamese) => {
  if (!penalty) return '';

  const fine =
    typeof penalty.fine_vnd === 'number'
      ? `${new Intl.NumberFormat('vi-VN').format(penalty.fine_vnd)} VND`
      : null;
  if (fine) return isVietnamese ? `Mức phạt: ${fine}` : `Penalty: ${fine}`;

  const amount = pickLocalizedValue(penalty, 'amount', isVietnamese);
  if (amount) return isVietnamese ? `Mức xử lý: ${amount}` : `Penalty: ${amount}`;

  const description = pickLocalizedValue(penalty, 'description', isVietnamese);
  return firstSentence(description);
};

const getRulesById = (rules = []) =>
  new Map(rules.filter((rule) => rule?.id).map((rule) => [rule.id, rule]));

const listReadable = (items = [], isVietnamese) => {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values.join('');
  if (values.length === 2) return values.join(isVietnamese ? ' và ' : ' and ');
  return `${values.slice(0, -1).join(', ')}${isVietnamese ? ' và ' : ', and '}${
    values[values.length - 1]
  }`;
};

const buildGroundedFallbackAnswer = (rule, isVietnamese) => {
  if (!rule) return defaultUnknownAnswer(isVietnamese);

  const lines = [
    `**${getRuleTitle(rule, isVietnamese)}**`,
    '',
    isVietnamese
      ? `Mình tìm thấy quy định này: ${ensureSentence(getRuleText(rule, isVietnamese))}`
      : `This rule says: ${ensureSentence(getRuleText(rule, isVietnamese))}`,
  ];

  const details = getRuleDetails(rule, isVietnamese);
  if (details && details !== getRuleText(rule, isVietnamese)) {
    lines.push('', `- ${isVietnamese ? 'Chi tiết' : 'Details'}: ${ensureSentence(details)}`);
  }

  const allowedDevices = pickLocalizedList(rule, 'allowed_devices', isVietnamese);
  if (allowedDevices.length > 0) {
    const allowedDeviceList = allowedDevices.join(', ');
    lines.push(
      `- ${isVietnamese ? 'Thiết bị được phép' : 'Allowed devices'}: ${allowedDeviceList}.`
    );
  }

  const penalty = formatPenalty(rule.penalty, isVietnamese);
  if (penalty) {
    lines.push(`- ${ensureSentence(penalty)}`);
  }

  return lines.join('\n');
};

const buildOverviewGroupBullet = (group, rulesById, isVietnamese) => {
  const rules = group.ids.map((id) => rulesById.get(id)).filter(Boolean);
  if (rules.length === 0) return '';

  const label = isVietnamese ? group.label_vi : group.label_en;
  const summaries = rules
    .slice(0, 2)
    .map((rule) => firstSentence(getRuleText(rule, isVietnamese)))
    .filter(Boolean);
  const remainingTitles = rules
    .slice(2, 5)
    .map((rule) => getRuleTitle(rule, isVietnamese))
    .filter(Boolean);

  const parts = [];
  if (summaries.length > 0) parts.push(summaries.join(' '));
  if (remainingTitles.length > 0) {
    parts.push(
      isVietnamese
        ? `Nhóm này cũng có ${listReadable(remainingTitles, isVietnamese)}.`
        : `This group also covers ${listReadable(remainingTitles, isVietnamese)}.`
    );
  }

  return `- **${label}:** ${parts.join(' ')}`;
};

const buildOverviewFallbackAnswer = (isVietnamese, rules = []) => {
  const rulesById = getRulesById(rules);
  const bullets = OVERVIEW_GROUPS.map((group) =>
    buildOverviewGroupBullet(group, rulesById, isVietnamese)
  ).filter(Boolean);

  if (isVietnamese) {
    return [
      `Mình tóm tắt nhanh nội quy KTX theo nhóm dưới đây; bạn có thể xem [toàn bộ nội quy ký túc xá](${FULL_RULES_URL}) khi cần đối chiếu đầy đủ.`,
      '',
      ...bullets,
      '',
      'Bạn có thể hỏi mình về khách, nấu ăn, về sau 22h, thiết bị, hoặc mức phạt.',
    ].join('\n');
  }

  return [
    `Here is a quick grouped overview of the dorm rules; you can read the [full dorm rules](${FULL_RULES_URL}) any time.`,
    '',
    ...bullets,
    '',
    'Ask me about guests, cooking, late return, devices, or penalties.',
  ].join('\n');
};

const groupRulesByCategory = (rules = []) => {
  const groups = new Map();
  for (const rule of rules) {
    const category = rule.category || 'general';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(rule);
  }

  return [...groups.entries()].sort(([categoryA], [categoryB]) => {
    const indexA = CATEGORY_ORDER.indexOf(categoryA);
    const indexB = CATEGORY_ORDER.indexOf(categoryB);
    if (indexA === -1 && indexB === -1) return categoryA.localeCompare(categoryB);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
};

const getCategoryLabel = (category, isVietnamese) => {
  const labels = CATEGORY_LABELS[category];
  if (labels) return isVietnamese ? labels.vi : labels.en;
  return category
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const buildFullRuleBullet = (rule, isVietnamese) => {
  const summary = firstSentence(getRuleText(rule, isVietnamese));
  const shortPenalty = formatShortPenalty(rule.penalty, isVietnamese);
  const penaltyText = shortPenalty ? ` ${ensureSentence(shortPenalty)}` : '';

  return `- **${getRuleTitle(rule, isVietnamese)}:** ${summary}${penaltyText}`;
};

const buildFullRulesFallbackAnswer = (isVietnamese, rules = []) => {
  const sections = groupRulesByCategory(rules).flatMap(([category, groupRules]) => [
    `## ${getCategoryLabel(category, isVietnamese)}`,
    ...groupRules.map((rule) => buildFullRuleBullet(rule, isVietnamese)),
    '',
  ]);

  if (isVietnamese) {
    return [
      `Dưới đây là toàn bộ nội quy hiện có, được nhóm theo mục. Bạn cũng có thể mở [toàn bộ nội quy ký túc xá](${FULL_RULES_URL}).`,
      '',
      ...sections,
    ]
      .join('\n')
      .trim();
  }

  return [
    `Here is the full current dorm rules list grouped by section. You can also open the [full dorm rules](${FULL_RULES_URL}).`,
    '',
    ...sections,
  ]
    .join('\n')
    .trim();
};

const toRuleResponse = (rule, isVietnamese) => ({
  id: rule.id,
  category: rule.category,
  title: getRuleTitle(rule, isVietnamese),
  title_en: rule.title_en || null,
  title_vi: rule.title_vi || null,
  rule: getRuleText(rule, isVietnamese),
  rule_en: rule.rule_en || null,
  rule_vi: rule.rule_vi || null,
  details: getRuleDetails(rule, isVietnamese) || null,
  details_en: rule.details_en || null,
  details_vi: rule.details_vi || null,
  allowed_devices: rule.allowed_devices || null,
  allowed_devices_en: rule.allowed_devices_en || null,
  allowed_devices_vi: rule.allowed_devices_vi || null,
  penalty: rule.penalty || null,
  source_ref: rule.source_ref || null,
  score: typeof rule.score === 'number' ? rule.score : 0,
});

const REWRITE_MAX_COMPLETION_TOKENS = {
  specific: 450,
  overview: 650,
  full: 2400,
};

const compactRuleBase = (rule, isVietnamese) => {
  const penaltyText = formatShortPenalty(rule.penalty, isVietnamese);

  return {
    id: rule.id,
    category: rule.category || null,
    title: getRuleTitle(rule, isVietnamese),
    ...(penaltyText ? { penalty_text: penaltyText } : {}),
    source_ref: rule.source_ref || null,
  };
};

const toSpecificRewriteRuleContext = (rule, isVietnamese) => {
  const details = getRuleDetails(rule, isVietnamese);

  return {
    ...compactRuleBase(rule, isVietnamese),
    rule: getRuleText(rule, isVietnamese),
    ...(details ? { details } : {}),
  };
};

const toSummaryRewriteRuleContext = (rule, isVietnamese) => ({
  ...compactRuleBase(rule, isVietnamese),
  summary: firstSentence(getRuleText(rule, isVietnamese)),
});

const uniqueRules = (rules = []) => {
  const seen = new Set();

  return rules.filter((rule) => {
    const id = rule?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const selectOverviewRewriteRules = (rules = []) => {
  const rulesById = getRulesById(rules);
  const selectedRules = OVERVIEW_GROUPS.flatMap((group) =>
    group.ids.map((id) => rulesById.get(id)).filter(Boolean)
  );

  return uniqueRules(selectedRules);
};

const buildRewriteRuleContext = (rules = [], mode, isVietnamese) => {
  if (mode === 'specific') {
    return rules.map((rule) => toSpecificRewriteRuleContext(rule, isVietnamese));
  }

  const selectedRules = mode === 'overview' ? selectOverviewRewriteRules(rules) : rules;
  return selectedRules.map((rule) => toSummaryRewriteRuleContext(rule, isVietnamese));
};

const rewriteDormRulesAnswer = async ({ draft, rules, source, language, mode }) => {
  if (!process.env.OPENAI_API_KEY) return draft;

  try {
    const isVietnamese = language === 'vi';
    const content = await openaiService.completion({
      temperature: 0.2,
      max_completion_tokens:
        REWRITE_MAX_COMPLETION_TOKENS[mode] || REWRITE_MAX_COMPLETION_TOKENS.specific,
      messages: [
        {
          role: 'system',
          content: [
            'Rewrite the provided dormitory-rules draft in a warm, concise student-support tone.',
            'Use Markdown and preserve headings, bullets, paragraph breaks, and the /student/dorm-rules link when present.',
            'Do not add facts. Do not change penalties, amounts, dates, times, or rule meanings.',
            'Do not mention any rule that is not in the provided selected_rules context.',
            'For full mode, keep every rule that appears in the draft.',
            'For Vietnamese, use friendly mình/bạn wording.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            mode,
            language,
            source_metadata: source || null,
            draft,
            selected_rules: buildRewriteRuleContext(rules, mode, isVietnamese),
          }),
        },
      ],
    });

    return String(content || '').trim() || draft;
  } catch {
    return draft;
  }
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
  const mode = getRuleQueryMode(q, candidates);
  const source = kb.knowledge_base || null;

  if (mode === 'overview') {
    const draft = buildOverviewFallbackAnswer(isVietnamese, kb.rules);
    const answer = await rewriteDormRulesAnswer({
      draft,
      rules: kb.rules,
      source,
      language,
      mode,
    });

    return {
      answer,
      matched_rules: kb.rules.map((rule) => toRuleResponse(rule, isVietnamese)),
      source,
      confidence: 'medium',
      knowledge_base_found: true,
      mode,
    };
  }

  if (mode === 'full') {
    const draft = buildFullRulesFallbackAnswer(isVietnamese, kb.rules);
    const answer = await rewriteDormRulesAnswer({
      draft,
      rules: kb.rules,
      source,
      language,
      mode,
    });

    return {
      answer,
      matched_rules: kb.rules.map((rule) => toRuleResponse(rule, isVietnamese)),
      source,
      confidence: 'medium',
      knowledge_base_found: true,
      mode,
    };
  }

  if (candidates.length === 0) {
    return {
      answer: defaultUnknownAnswer(isVietnamese),
      matched_rules: [],
      source,
      confidence: 'low',
      knowledge_base_found: true,
      mode: 'unknown',
    };
  }

  const draft = buildGroundedFallbackAnswer(candidates[0], isVietnamese);
  const answer = await rewriteDormRulesAnswer({
    draft,
    rules: [candidates[0]],
    source,
    language,
    mode: 'specific',
  });

  return {
    answer,
    matched_rules: candidates.map((rule) => toRuleResponse(rule, isVietnamese)),
    source,
    confidence: candidates[0].score >= 12 ? 'high' : candidates[0].score >= 7 ? 'medium' : 'low',
    knowledge_base_found: true,
    mode: 'specific',
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
