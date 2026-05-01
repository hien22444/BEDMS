const DORM_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DORM_UTC_OFFSET_HOURS = 7;

const DORM_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DORM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

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

const getDateKeyInDormTimezone = (value) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return '';

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const getStartOfTodayInDormTimezone = (now = new Date()) => {
  const parts = getDatePartsInDormTimezone(now);
  if (!parts) return new Date(NaN);

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, -DORM_UTC_OFFSET_HOURS, 0, 0, 0)
  );
};

const normalizeDateOnlyToDormNoonUtc = (value) => {
  const parts = getDatePartsInDormTimezone(value);
  if (!parts) return new Date(NaN);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
};

module.exports = {
  DORM_TIMEZONE,
  getDateKeyInDormTimezone,
  getStartOfTodayInDormTimezone,
  normalizeDateOnlyToDormNoonUtc,
};
