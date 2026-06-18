import type { ZodIssue } from "zod";

import { ValidatedAmsRecordSchema } from "./types.ts";
import type { ValidationResult } from "./types.ts";

export function validateAmsRecord(record: unknown): ValidationResult {
  const parsed = ValidatedAmsRecordSchema.safeParse(record);

  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.flatMap(formatIssue)
    };
  }

  return { ok: true, record: parsed.data };
}

function formatIssue(issue: ZodIssue): string[] {
  const path = issue.path.map(String).join(".");

  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => {
      const field = path ? `${path}.${key}` : key;
      return `unrecognized field: "${field}"`;
    });
  }

  return [`${path}: ${issue.message}`];
}
