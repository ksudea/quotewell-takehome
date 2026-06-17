import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { submitAndConfirmRecord } from "./amsClient.ts";
import { extractEmail } from "./extractionClient.ts";
import { normalizeExtractedRecord } from "./normalizer.ts";
import { parseModelOutput } from "./parser.ts";
import { reconcileWithSource } from "./reconciler.ts";
import { logStage, printAudit } from "./reporter.ts";
import type { FieldCorrection, PipelineResult } from "./types.ts";
import { validateAmsRecord } from "./validator.ts";

const BASE_URL = process.env.AMS_BASE_URL ?? "http://localhost:8472";
const INBOX_DIR = process.env.INBOX_DIR ?? "inbox";

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
  const email = await readFile(path.join(INBOX_DIR, fileName), "utf8");
  const corrections: FieldCorrection[] = [];

  try {
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
    const validationIssues = [...normalized.issues, ...validateAmsRecord(reconciled.record)];
    if (validationIssues.length > 0) {
      return {
        fileName,
        status: "failed_needs_review",
        corrections,
        retryCount: 0,
        actionNeeded: `Fix validation issues: ${validationIssues.join("; ")}`
      };
    }

    logStage(fileName, "submit");
    const submission = await submitAndConfirmRecord(reconciled.record, { baseUrl: BASE_URL });

    logStage(fileName, "confirm");
    if (!submission.ok) {
      return {
        fileName,
        status: submission.fatal ? "failed_needs_review" : "failed_submission",
        corrections,
        retryCount: Math.max(0, submission.attempts.length - 1),
        actionNeeded: submission.error
      };
    }

    return {
      fileName,
      status: corrections.length > 0 ? "corrected_and_confirmed" : "confirmed",
      recordId: submission.recordId,
      corrections,
      retryCount: Math.max(0, submission.attempts.length - 1)
    };
  } catch (error) {
    return {
      fileName,
      status: "failed_submission",
      corrections,
      retryCount: 0,
      actionNeeded: error instanceof Error ? error.message : String(error)
    };
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
