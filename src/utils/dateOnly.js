const DORM_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DORM_UTC_OFFSET_HOURS = 7;
const DAY_END = [23, 59, 59, 999];

const DORM_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DORM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const buildDormLocalDate = (year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) =>
  new Date(
    Date.UTC(year, month - 1, day, hour - DORM_UTC_OFFSET_HOURS, minute, second, millisecond)
  );

const getDatePartsInDormTimezone = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = DORM_DATE_PARTS_FORMATTER.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (!year || !month || !day) return null;

  return { year, month, day };
};

const normalizeDateOnlyPartsToDormNoonUtc = (year, month, day) => {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};

const normalizeStrictDateOnlyPartsToDormNoonUtc = (year, month, day) => {
  const parsed = normalizeDateOnlyPartsToDormNoonUtc(year, month, day);
  const parts = getDatePartsInDormTimezone(parsed);
  if (!parts || parts.year !== year || parts.month !== month || parts.day !== day) {
    return new Date(NaN);
  }

  return parsed;
};

const getDateKeyInDormTimezone = (value) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return '';

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const getDateCodeInDormTimezone = (value = new Date()) =>
  getDateKeyInDormTimezone(value).replace(/-/g, '');

const getMonthKeyInDormTimezone = (value = new Date()) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return '';

  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
};

const getStartOfDayInDormTimezone = (value = new Date()) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return new Date(NaN);

  return buildDormLocalDate(parts.year, parts.month, parts.day);
};

const getEndOfDayInDormTimezone = (value = new Date()) => {
  const startOfNextDay = getStartOfNextDayInDormTimezone(value);
  if (Number.isNaN(startOfNextDay.getTime())) return new Date(NaN);

  return new Date(startOfNextDay.getTime() - 1);
};

const getDormDayRange = (value = new Date()) => ({
  start: getStartOfDayInDormTimezone(value),
  end: getEndOfDayInDormTimezone(value),
});

const getStartOfTodayInDormTimezone = (now = new Date()) => {
  return getStartOfDayInDormTimezone(now);
};

const getStartOfNextDayInDormTimezone = (value = new Date()) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return new Date(NaN);

  return buildDormLocalDate(parts.year, parts.month, parts.day + 1);
};

const getMonthRangeInDormTimezone = (year, month) => {
  const start = buildDormLocalDate(year, month, 1);
  const nextMonthStart = buildDormLocalDate(year, month + 1, 1);

  return {
    start,
    end: new Date(nextMonthStart.getTime() - 1),
  };
};

const normalizeDateOnlyToDormNoonUtc = (value) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return new Date(NaN);

  return normalizeDateOnlyPartsToDormNoonUtc(parts.year, parts.month, parts.day);
};

module.exports = {
  DAY_END,
  DORM_TIMEZONE,
  buildDormLocalDate,
  getDatePartsInDormTimezone,
  getDateCodeInDormTimezone,
  getDateKeyInDormTimezone,
  getDormDayRange,
  getEndOfDayInDormTimezone,
  getMonthKeyInDormTimezone,
  getMonthRangeInDormTimezone,
  getStartOfDayInDormTimezone,
  getStartOfNextDayInDormTimezone,
  getStartOfTodayInDormTimezone,
  normalizeDateOnlyPartsToDormNoonUtc,
  normalizeStrictDateOnlyPartsToDormNoonUtc,
  normalizeDateOnlyToDormNoonUtc,
};
