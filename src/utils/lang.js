const toText = (value) => String(value || '').trim();

const normalize = (text = '') =>
  toText(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const detectPreferredLanguage = (text = '') => {
  const raw = text || '';
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/u.test(raw)) {
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
    'book',
    'booking',
    'bed',
    'utility',
    'utilities',
    'electricity',
    'water',
    'meter',
    'bill',
    'conduct',
    'behavioral',
    'violation',
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
    'dat phong',
    'dat giuong',
    'thue phong',
    'dang ky phong',
    'dien nuoc',
    'chi so',
    'dong ho',
    'hanh kiem',
    'diem hanh kiem',
    'vi pham',
    'ky luat',
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

module.exports = { normalize, detectPreferredLanguage };
