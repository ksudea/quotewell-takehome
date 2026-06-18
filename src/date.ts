const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

export function isValidIsoDate(value: string): boolean {
  const match = value.match(ISO_DATE_PATTERN);
  if (!match) return false;

  const [, yearRaw, monthRaw, dayRaw] = match;
  if (!yearRaw || !monthRaw || !dayRaw) return false;

  return isValidDateParts(Number(yearRaw), Number(monthRaw), Number(dayRaw));
}

export function normalizeUsSlashDate(value: string): string | null {
  const match = value.match(US_SLASH_DATE_PATTERN);
  if (!match) return null;

  const [, monthRaw, dayRaw, yearRaw] = match;
  if (!monthRaw || !dayRaw || !yearRaw) return null;

  const yearNumber = Number(yearRaw);
  const year = yearRaw.length === 2 ? 2000 + yearNumber : yearNumber;
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!isValidDateParts(year, month, day)) return null;

  return `${year}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
