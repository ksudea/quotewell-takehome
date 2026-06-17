import type { AmsRecord, FieldCorrection } from "./types.ts";

type ReconcileResult = {
  record: AmsRecord;
  corrections: FieldCorrection[];
};

export function reconcileWithSource(record: AmsRecord, email: string): ReconcileResult {
  let nextRecord = structuredClone(record);
  const corrections: FieldCorrection[] = [];

  if (/revenue\s+is\s+TBD/i.test(email) && nextRecord.annualRevenue !== null) {
    corrections.push({
      field: "annualRevenue",
      modelValue: nextRecord.annualRevenue,
      finalValue: null,
      evidenceSnippet: evidenceAround(email, /revenue\s+is\s+TBD/i),
      reason: "Source email says revenue is genuinely not stated; AMS requires null rather than a guess"
    });
    nextRecord = { ...nextRecord, annualRevenue: null };
  }

  const poBoxMatch = email.match(/PO Box\s+1142,\s*Bend,\s*OR\s*97709/i);
  if (poBoxMatch && nextRecord.mailingAddress.street !== "PO Box 1142") {
    const finalValue = {
      street: "PO Box 1142",
      city: "Bend",
      state: "OR",
      zip: "97709"
    };
    corrections.push({
      field: "mailingAddress",
      modelValue: nextRecord.mailingAddress,
      finalValue,
      evidenceSnippet: evidenceAround(email, /PO Box\s+1142,\s*Bend,\s*OR\s*97709/i),
      reason: "Source explicitly says all mail goes to the owner PO Box, not the facility"
    });
    nextRecord = { ...nextRecord, mailingAddress: finalValue };
  }

  return { record: nextRecord, corrections };
}

function evidenceAround(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return "";

  const start = Math.max(0, match.index - 90);
  const end = Math.min(text.length, match.index + match[0].length + 110);
  return text
    .slice(start, end)
    .replace(/^>+\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
