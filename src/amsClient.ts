import type { AmsRecord, SubmissionAttempt, SubmissionResult, ValidatedAmsRecord } from "./types.ts";

const CONFIRMATION_ATTEMPTS = 3;

type SubmitOptions = {
  baseUrl: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
};

export async function submitAndConfirmRecord(
  record: ValidatedAmsRecord,
  options: SubmitOptions
): Promise<SubmissionResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxAttempts = options.maxAttempts ?? 6;
  const attempts: SubmissionAttempt[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await requestWithTimeout(
        fetchFn,
        `${options.baseUrl}/api/v1/records`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(record)
        },
        timeoutMs
      );
      const responseText = await response.text();
      const body = parseJsonObject(responseText);

      if (response.status === 201) {
        const recordId = typeof body?.["recordId"] === "string" ? body["recordId"] : null;
        const status = body?.["status"];
        if (!recordId || status !== "accepted") {
          const message = "malformed 201 response missing accepted recordId; not retrying POST because AMS may have saved it";
          attempts.push({ attempt, status: response.status, message });
          return {
            ok: false,
            attempts,
            confirmationAttempts: 0,
            error: `AMS returned ${message}`,
            fatal: false
          };
        }

        const confirmed = await confirmRecordWithRetries(fetchFn, options.baseUrl, recordId, record, timeoutMs, sleep);
        if (confirmed.ok) {
          attempts.push({ attempt, status: response.status, message: "accepted and confirmed" });
          return { ok: true, recordId, attempts, confirmationAttempts: confirmed.attempts };
        }

        attempts.push({ attempt, status: response.status, message: `accepted but confirmation failed: ${confirmed.message}` });
        return {
          ok: false,
          recordId,
          attempts,
          confirmationAttempts: confirmed.attempts,
          error: `AMS accepted record ${recordId} but confirmation failed: ${confirmed.message}`,
          fatal: false
        };
      }

      if (response.status === 429) {
        const retryAfterMs = retryAfterToMs(response.headers.get("retry-after")) ?? backoffMs(attempt);
        attempts.push({
          attempt,
          status: response.status,
          message: "rate limited",
          retryAfterMs
        });
        await sleep(retryAfterMs);
        continue;
      }

      if (response.status === 200) {
        attempts.push({
          attempt,
          status: response.status,
          message: "malformed 200 response was not treated as success"
        });
        await sleep(backoffMs(attempt));
        continue;
      }

      if (response.status === 422) {
        const details = JSON.stringify(body?.["details"] ?? body ?? responseText);
        attempts.push({ attempt, status: response.status, message: `validation failed: ${details}` });
        return { ok: false, attempts, confirmationAttempts: 0, error: `AMS validation failed: ${details}`, fatal: true };
      }

      if (response.status >= 500) {
        attempts.push({ attempt, status: response.status, message: `server error: ${responseText}` });
        await sleep(backoffMs(attempt));
        continue;
      }

      attempts.push({ attempt, status: response.status, message: `non-retryable response: ${responseText}` });
      return {
        ok: false,
        attempts,
        confirmationAttempts: 0,
        error: `AMS rejected request with HTTP ${response.status}`,
        fatal: true
      };
    } catch (error) {
      attempts.push({
        attempt,
        message: error instanceof Error ? error.message : String(error)
      });
      await sleep(backoffMs(attempt));
    }
  }

  return {
    ok: false,
    attempts,
    confirmationAttempts: 0,
    error: `AMS submission not confirmed after ${maxAttempts} attempts`,
    fatal: false
  };
}

async function confirmRecordWithRetries(
  fetchFn: typeof fetch,
  baseUrl: string,
  recordId: string,
  expected: AmsRecord,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>
): Promise<{ ok: true; attempts: number } | { ok: false; attempts: number; message: string }> {
  let lastMessage = "confirmation was not attempted";

  for (let attempt = 1; attempt <= CONFIRMATION_ATTEMPTS; attempt++) {
    try {
      const confirmed = await confirmRecord(fetchFn, baseUrl, recordId, expected, timeoutMs);
      if (confirmed.ok) return { ok: true, attempts: attempt };
      lastMessage = confirmed.message;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    }

    if (attempt < CONFIRMATION_ATTEMPTS) {
      await sleep(backoffMs(attempt));
    }
  }

  return { ok: false, attempts: CONFIRMATION_ATTEMPTS, message: lastMessage };
}

async function confirmRecord(
  fetchFn: typeof fetch,
  baseUrl: string,
  recordId: string,
  expected: AmsRecord,
  timeoutMs: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await requestWithTimeout(fetchFn, `${baseUrl}/api/v1/records/${recordId}`, { method: "GET" }, timeoutMs);
  if (!response.ok) return { ok: false, message: `confirmation GET failed with HTTP ${response.status}` };

  const saved = parseJsonObject(await response.text());
  if (!isObject(saved)) return { ok: false, message: "confirmation GET returned malformed JSON" };

  const savedRecord = {
    insuredName: saved["insuredName"],
    dba: saved["dba"],
    mailingAddress: saved["mailingAddress"],
    lineOfBusiness: saved["lineOfBusiness"],
    effectiveDate: saved["effectiveDate"],
    annualRevenue: saved["annualRevenue"],
    contactEmail: saved["contactEmail"]
  };

  if (stableStringify(savedRecord) !== stableStringify(expected)) {
    return { ok: false, message: "confirmation GET returned a record that did not match submitted payload" };
  }

  return { ok: true };
}

async function requestWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function retryAfterToMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
}

function backoffMs(attempt: number): number {
  return Math.min(250 * 2 ** (attempt - 1), 2_000);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(",")}}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
