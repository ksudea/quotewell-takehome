import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { submitAndConfirmRecord } from "./amsClient.ts";
import { extractEmail } from "./extractionClient.ts";
import { normalizeExtractedRecord } from "./normalizer.ts";
import { parseModelOutput } from "./parser.ts";
import { reconcileWithSource } from "./reconciler.ts";
import { logStage, printAudit } from "./reporter.ts";
import type { FieldCorrection, PipelineResult, SubmissionResult } from "./types.ts";
import { validateAmsRecord } from "./validator.ts";

const BASE_URL = process.env["AMS_BASE_URL"] ?? "http://localhost:8472";
const INBOX_DIR = process.env["INBOX_DIR"] ?? "inbox";

async function main(): Promise<void> {
  const files = (await readdir(INBOX_DIR)).filter((file) => file.endsWith(".txt")).sort();
  const results: PipelineResult[] = [];

  for (const fileName of files) {
    results.push(await processEmail(fileName));
  }

  printAudit(results);

  if (results.some((result) => result.status.startsWith("failed"))) {
    process.exitCode = 1;
  }
}

async function processEmail(fileName: string): Promise<PipelineResult> {
  const corrections: FieldCorrection[] = [];
  let unexpectedFailureStatus: "failed_needs_review" | "failed_submission" = "failed_needs_review";

  try {
    const email = await readFile(path.join(INBOX_DIR, fileName), "utf8");

    logStage(fileName, "extract");
    const rawModelOutput = await extractEmail(email, { baseUrl: BASE_URL });

    logStage(fileName, "parse");
    const parsed = parseModelOutput(rawModelOutput);

    logStage(fileName, "reconcile");
    const normalized = normalizeExtractedRecord(parsed);
    corrections.push(...normalized.corrections);
    const reconciled = reconcileWithSource(normalized.record, email);
    corrections.push(...reconciled.corrections);

    logStage(fileName, "validate");
    const validation = validateAmsRecord(reconciled.record);
    if (normalized.issues.length > 0 || !validation.ok) {
      const validationIssues = [...normalized.issues, ...(!validation.ok ? validation.issues : [])];
      return {
        fileName,
        status: "failed_needs_review",
        corrections,
        retryCount: 0,
        actionNeeded: `Fix validation issues: ${validationIssues.join("; ")}`
      };
    }

    logStage(fileName, "submit");
    unexpectedFailureStatus = "failed_submission";
    const submission = await submitAndConfirmRecord(validation.record, { baseUrl: BASE_URL });

    logStage(fileName, "confirm");
    if (!submission.ok) {
      return {
        fileName,
        status: submission.fatal ? "failed_needs_review" : "failed_submission",
        ...(submission.recordId ? { recordId: submission.recordId } : {}),
        corrections,
        retryCount: retryCountFor(submission),
        actionNeeded: submission.error
      };
    }

    return {
      fileName,
      status: corrections.length > 0 ? "corrected_and_confirmed" : "confirmed",
      recordId: submission.recordId,
      corrections,
      retryCount: retryCountFor(submission)
    };
  } catch (error) {
    return {
      fileName,
      status: unexpectedFailureStatus,
      corrections,
      retryCount: 0,
      actionNeeded: error instanceof Error ? error.message : String(error)
    };
  }
}

function retryCountFor(submission: SubmissionResult): number {
  return Math.max(0, submission.attempts.length - 1) + Math.max(0, submission.confirmationAttempts - 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
