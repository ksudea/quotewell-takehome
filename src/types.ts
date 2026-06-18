import { z } from "zod";

import { isValidIsoDate } from "./date.ts";

export const LINES_OF_BUSINESS = [
  "general_liability",
  "commercial_property",
  "workers_compensation",
  "commercial_auto",
  "bop"
] as const;

export const LineOfBusinessSchema = z.enum(LINES_OF_BUSINESS);

export type LineOfBusiness = z.infer<typeof LineOfBusinessSchema>;

export const USPS_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC"
] as const;

const USPS_STATE_SET = new Set<string>(USPS_STATES);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const requiredString = (message: string) => z.string().refine((value) => value.trim().length > 0, message);

const EffectiveDateSchema = z.string().superRefine((value, context) => {
  if (!ISO_DATE_PATTERN.test(value)) {
    context.addIssue({ code: "custom", message: "required YYYY-MM-DD" });
    return;
  }

  if (!isValidIsoDate(value)) {
    context.addIssue({ code: "custom", message: "invalid calendar date" });
  }
});

export const MailingAddressSchema = z
  .object({
    street: requiredString("required"),
    city: requiredString("required"),
    state: z.string().refine((value) => USPS_STATE_SET.has(value), "required 2-letter USPS code"),
    zip: z.string().regex(/^\d{5}$/, "required 5-digit ZIP")
  })
  .strict();

export const AmsRecordSchema = z
  .object({
    insuredName: requiredString("required"),
    dba: z.string().refine((value) => value.trim().length > 0, "must be null or non-empty").nullable(),
    mailingAddress: MailingAddressSchema,
    lineOfBusiness: LineOfBusinessSchema,
    effectiveDate: EffectiveDateSchema,
    annualRevenue: z.number().refine(Number.isFinite, "must be numeric USD or null").nullable(),
    contactEmail: z.string().regex(EMAIL_PATTERN, "invalid email")
  })
  .strict();

export type MailingAddress = z.infer<typeof MailingAddressSchema>;
export type AmsRecord = z.infer<typeof AmsRecordSchema>;

export const ValidatedAmsRecordSchema = AmsRecordSchema.brand<"ValidatedAmsRecord">();

export type ValidatedAmsRecord = z.infer<typeof ValidatedAmsRecordSchema>;

export type ValidationResult =
  | {
      ok: true;
      record: ValidatedAmsRecord;
    }
  | {
      ok: false;
      issues: string[];
    };

export type AmsFieldPath = keyof AmsRecord | `mailingAddress.${keyof MailingAddress}`;

export type FieldCorrection = {
  field: AmsFieldPath;
  modelValue: unknown;
  finalValue: unknown;
  evidenceSnippet: string;
  reason: string;
};

export type PipelineStatus =
  | "confirmed"
  | "corrected_and_confirmed"
  | "failed_needs_review"
  | "failed_submission";

export type SubmissionAttempt = {
  attempt: number;
  status?: number;
  message: string;
  retryAfterMs?: number;
};

export type SubmissionResult =
  | {
      ok: true;
      recordId: string;
      attempts: SubmissionAttempt[];
      confirmationAttempts: number;
    }
  | {
      ok: false;
      recordId?: string;
      attempts: SubmissionAttempt[];
      confirmationAttempts: number;
      error: string;
      fatal: boolean;
    };

type PipelineResultBase = {
  fileName: string;
  corrections: FieldCorrection[];
  retryCount: number;
};

export type PipelineResult =
  | (PipelineResultBase & {
      status: Extract<PipelineStatus, "confirmed" | "corrected_and_confirmed">;
      recordId: string;
      actionNeeded?: never;
    })
  | (PipelineResultBase & {
      status: Extract<PipelineStatus, "failed_needs_review" | "failed_submission">;
      recordId?: string;
      actionNeeded: string;
    });
