import type { PipelineResult } from "./types.ts";

export function logStage(fileName: string, stage: string): void {
  console.log(`[${fileName}] ${stage}`);
}

export function printAudit(results: PipelineResult[]): void {
  console.log("\nFinal intake audit");
  console.log("==================");

  for (const result of results) {
    const correctedFields = result.corrections.map((correction) => correction.field);
    console.log(`\n${result.fileName}`);
    console.log(`  status: ${result.status}`);
    console.log(`  recordId: ${result.recordId ?? "n/a"}`);
    console.log(`  correctedFields: ${correctedFields.length > 0 ? correctedFields.join(", ") : "none"}`);
    console.log(`  retryCount: ${result.retryCount}`);
    console.log(`  actionNeeded: ${result.actionNeeded ?? "none"}`);

    for (const correction of result.corrections) {
      console.log(`  - ${correction.field}: ${correction.reason}`);
      console.log(`    evidence: ${correction.evidenceSnippet}`);
    }
  }
}
