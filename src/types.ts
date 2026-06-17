export type LineOfBusiness =
  | "general_liability"
  | "commercial_property"
  | "workers_compensation"
  | "commercial_auto"
  | "bop";

export type MailingAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type AmsRecord = {
  insuredName: string;
  dba: string | null;
  mailingAddress: MailingAddress;
  lineOfBusiness: LineOfBusiness;
  effectiveDate: string;
  annualRevenue: number | null;
  contactEmail: string;
};

export type FieldCorrection = {
  field: string;
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
    }
  | {
      ok: false;
      recordId?: string;
      attempts: SubmissionAttempt[];
      error: string;
      fatal: boolean;
    };

export type PipelineResult = {
  fileName: string;
  status: PipelineStatus;
  recordId?: string;
  corrections: FieldCorrection[];
  retryCount: number;
  actionNeeded?: string;
};
