import type { AmsRecord, FieldCorrection } from "./types.ts";

const PO_BOX_ADDRESS_PATTERN = /P\.?\s*O\.?\s*Box\s+(\d+),\s*([^,\n]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i;

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

  const poBoxMatch = email.match(PO_BOX_ADDRESS_PATTERN);
  if (poBoxMatch) {
    const finalValue = {
      street: `PO Box ${poBoxMatch[1]}`,
      city: poBoxMatch[2]?.trim() ?? "",
      state: poBoxMatch[3]?.toUpperCase() ?? "",
      zip: poBoxMatch[4] ?? ""
    };
    if (!sameMailingAddress(nextRecord.mailingAddress, finalValue)) {
      corrections.push({
        field: "mailingAddress",
        modelValue: nextRecord.mailingAddress,
        finalValue,
        evidenceSnippet: evidenceAround(email, PO_BOX_ADDRESS_PATTERN),
        reason: "Source explicitly says all mail goes to the owner PO Box, not the facility"
      });
      nextRecord = { ...nextRecord, mailingAddress: finalValue };
    }
  }

  return { record: nextRecord, corrections };
}

function sameMailingAddress(left: AmsRecord["mailingAddress"], right: AmsRecord["mailingAddress"]): boolean {
  return left.street === right.street && left.city === right.city && left.state === right.state && left.zip === right.zip;
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
