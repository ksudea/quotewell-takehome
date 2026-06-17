import type { AmsRecord, LineOfBusiness } from "./types.ts";

const USPS_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " "
  )
);

const LINES_OF_BUSINESS = new Set<LineOfBusiness>([
  "general_liability",
  "commercial_property",
  "workers_compensation",
  "commercial_auto",
  "bop"
]);

export function validateAmsRecord(record: AmsRecord): string[] {
  const issues: string[] = [];

  if (!record.insuredName.trim()) issues.push("insuredName: required");
  if (record.dba !== null && !record.dba.trim()) issues.push("dba: must be null or non-empty");
  if (!record.mailingAddress.street.trim()) issues.push("mailingAddress.street: required");
  if (!record.mailingAddress.city.trim()) issues.push("mailingAddress.city: required");
  if (!USPS_STATES.has(record.mailingAddress.state)) {
    issues.push("mailingAddress.state: required 2-letter USPS code");
  }
  if (!/^\d{5}$/.test(record.mailingAddress.zip)) {
    issues.push("mailingAddress.zip: required 5-digit ZIP");
  }
  if (!LINES_OF_BUSINESS.has(record.lineOfBusiness)) {
    issues.push("lineOfBusiness: unsupported AMS enum");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.effectiveDate)) {
    issues.push("effectiveDate: required YYYY-MM-DD");
  }
  if (record.annualRevenue !== null && !Number.isFinite(record.annualRevenue)) {
    issues.push("annualRevenue: must be numeric USD or null");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.contactEmail)) {
    issues.push("contactEmail: invalid email");
  }

  return issues;
}
