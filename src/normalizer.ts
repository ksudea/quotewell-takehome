import type { AmsRecord, FieldCorrection, LineOfBusiness, MailingAddress } from "./types.ts";

type NormalizeResult = {
  record: AmsRecord;
  corrections: FieldCorrection[];
  issues: string[];
};

const STATE_ALIASES: Record<string, string> = {
  TEX: "TX",
  "TEX.": "TX",
  TEXAS: "TX",
  ALABAMA: "AL",
  OREGON: "OR"
};

export function normalizeExtractedRecord(input: unknown): NormalizeResult {
  if (!isObject(input)) {
    throw new Error("Extraction JSON was not an object");
  }

  const corrections: FieldCorrection[] = [];
  const issues: string[] = [];
  const rawAddress = isObject(input.mailingAddress) ? input.mailingAddress : {};

  const mailingAddress: MailingAddress = {
    street: normalizeRequiredString(rawAddress.street, "mailingAddress.street", issues),
    city: normalizeRequiredString(rawAddress.city, "mailingAddress.city", issues),
    state: normalizeState(rawAddress.state, corrections),
    zip: normalizeZip(rawAddress.zip, issues)
  };

  const record: AmsRecord = {
    insuredName: normalizeRequiredString(input.insuredName, "insuredName", issues),
    dba: normalizeNullableString(input.dba),
    mailingAddress,
    lineOfBusiness: normalizeLineOfBusiness(input.lineOfBusiness, issues, corrections),
    effectiveDate: normalizeDate(input.effectiveDate, issues, corrections),
    annualRevenue: normalizeRevenue(input.annualRevenue, issues, corrections),
    contactEmail: normalizeRequiredString(input.contactEmail, "contactEmail", issues)
  };

  return { record, corrections, issues };
}

function normalizeRequiredString(value: unknown, field: string, issues: string[]): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  issues.push(`${field}: missing required string`);
  return "";
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function normalizeState(value: unknown, corrections: FieldCorrection[]): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const upper = raw.toUpperCase();
  const normalized = STATE_ALIASES[upper] ?? upper;

  if (raw && normalized !== raw) {
    corrections.push({
      field: "mailingAddress.state",
      modelValue: raw,
      finalValue: normalized,
      evidenceSnippet: raw,
      reason: "Normalized state to 2-letter USPS code required by AMS"
    });
  }

  return normalized;
}

function normalizeZip(value: unknown, issues: string[]): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/\d{5}/);
  if (match) return match[0];
  issues.push("mailingAddress.zip: missing 5-digit ZIP");
  return raw;
}

function normalizeLineOfBusiness(
  value: unknown,
  issues: string[],
  corrections: FieldCorrection[]
): LineOfBusiness {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const mappings: Record<string, LineOfBusiness> = {
    gl: "general_liability",
    general_liability: "general_liability",
    general_liability_policy: "general_liability",
    workers_compensation: "workers_compensation",
    workers_comp: "workers_compensation",
    work_comp: "workers_compensation",
    commercial_property: "commercial_property",
    property: "commercial_property",
    commercial_auto: "commercial_auto",
    bop: "bop",
    business_owners_policy: "bop"
  };
  const normalized = mappings[key];

  if (!normalized) {
    issues.push(`lineOfBusiness: unsupported value "${raw}"`);
    return "general_liability";
  }

  if (raw !== normalized) {
    corrections.push({
      field: "lineOfBusiness",
      modelValue: raw,
      finalValue: normalized,
      evidenceSnippet: raw,
      reason: "Mapped model wording to AMS line-of-business enum"
    });
  }

  return normalized;
}

function normalizeDate(value: unknown, issues: string[], corrections: FieldCorrection[]): string {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, monthRaw, dayRaw, yearRaw] = slashMatch;
    const yearNumber = Number(yearRaw);
    const year = yearRaw?.length === 2 ? 2000 + yearNumber : yearNumber;
    const normalized = `${year}-${monthRaw?.padStart(2, "0")}-${dayRaw?.padStart(2, "0")}`;
    corrections.push({
      field: "effectiveDate",
      modelValue: raw,
      finalValue: normalized,
      evidenceSnippet: raw,
      reason: "Normalized date to YYYY-MM-DD required by AMS"
    });
    return normalized;
  }

  issues.push(`effectiveDate: unsupported value "${raw}"`);
  return raw;
}

function normalizeRevenue(value: unknown, issues: string[], corrections: FieldCorrection[]): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value).trim();
  if (/^(tbd|unknown|n\/a)$/i.test(raw)) return null;

  const amountMatch = raw.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*([mk])?/i);
  if (!amountMatch) {
    issues.push(`annualRevenue: unsupported value "${raw}"`);
    return null;
  }

  const amount = Number(amountMatch[1]);
  const suffix = amountMatch[2]?.toLowerCase();
  const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  const normalized = Math.round(amount * multiplier);

  corrections.push({
    field: "annualRevenue",
    modelValue: raw,
    finalValue: normalized,
    evidenceSnippet: raw,
    reason: "Converted model revenue text to numeric USD required by AMS"
  });

  return normalized;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
