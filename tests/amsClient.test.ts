import test from "node:test";
import assert from "node:assert/strict";

import { submitAndConfirmRecord } from "../src/amsClient.ts";
import { validateAmsRecord } from "../src/validator.ts";
import type { AmsRecord, ValidatedAmsRecord } from "../src/types.ts";

const record: AmsRecord = {
  insuredName: "Blue Oak Industries LLC",
  dba: "Blue Oak Manufacturing",
  mailingAddress: {
    street: "4180 Commerce Park Dr, Suite B",
    city: "Waco",
    state: "TX",
    zip: "76712"
  },
  lineOfBusiness: "general_liability",
  effectiveDate: "2026-07-01",
  annualRevenue: 4200000,
  contactEmail: "maria@blueoakmfg.com"
};

const validatedRecord = validateForTest(record);

test("submitAndConfirmRecord retries malformed 200 and only succeeds after GET confirmation", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(requestLabel(input, init));

    if (url.endsWith("/api/v1/records") && calls.length === 1) {
      return jsonResponse({ status: "accepted" });
    }

    if (url.endsWith("/api/v1/records")) {
      return acceptedResponse("AMS-123");
    }

    if (url.endsWith("/api/v1/records/AMS-123")) {
      return confirmedRecordResponse("AMS-123");
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(validatedRecord, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async () => undefined,
    timeoutMs: 50,
    maxAttempts: 3
  });

  assert.equal(result.ok, true);
  assert.equal(result.recordId, "AMS-123");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.confirmationAttempts, 1);
  assert.match(result.attempts[0]?.message ?? "", /malformed 200/i);
  assert.deepEqual(calls, [
    "POST http://ams.test/api/v1/records",
    "POST http://ams.test/api/v1/records",
    "GET http://ams.test/api/v1/records/AMS-123"
  ]);
});

test("submitAndConfirmRecord respects Retry-After on 429 before retrying", async () => {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(requestLabel(input, init));

    if (url.endsWith("/api/v1/records") && calls.length === 1) {
      return jsonResponse({ error: "rate limited" }, 429, { "retry-after": "2" });
    }

    if (url.endsWith("/api/v1/records")) {
      return acceptedResponse("AMS-789");
    }

    if (url.endsWith("/api/v1/records/AMS-789")) {
      return confirmedRecordResponse("AMS-789");
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(validatedRecord, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    timeoutMs: 50,
    maxAttempts: 3
  });

  assert.equal(result.ok, true);
  assert.equal(result.recordId, "AMS-789");
  assert.equal(result.attempts[0]?.status, 429);
  assert.equal(result.attempts[0]?.retryAfterMs, 2000);
  assert.deepEqual(sleeps, [2000]);
  assert.deepEqual(calls, [
    "POST http://ams.test/api/v1/records",
    "POST http://ams.test/api/v1/records",
    "GET http://ams.test/api/v1/records/AMS-789"
  ]);
});

test("submitAndConfirmRecord retries 503 before confirming a later acceptance", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(requestLabel(input, init));

    if (url.endsWith("/api/v1/records") && calls.length === 1) {
      return new Response("temporarily unavailable", { status: 503 });
    }

    if (url.endsWith("/api/v1/records")) {
      return acceptedResponse("AMS-503");
    }

    if (url.endsWith("/api/v1/records/AMS-503")) {
      return confirmedRecordResponse("AMS-503");
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(validatedRecord, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async () => undefined,
    timeoutMs: 50,
    maxAttempts: 3
  });

  assert.equal(result.ok, true);
  assert.equal(result.recordId, "AMS-503");
  assert.equal(result.attempts[0]?.status, 503);
  assert.match(result.attempts[0]?.message ?? "", /server error/i);
  assert.deepEqual(calls, [
    "POST http://ams.test/api/v1/records",
    "POST http://ams.test/api/v1/records",
    "GET http://ams.test/api/v1/records/AMS-503"
  ]);
});

test("submitAndConfirmRecord retries a timed-out POST before confirming a later acceptance", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(requestLabel(input, init));

    if (url.endsWith("/api/v1/records") && calls.length === 1) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true }
        );
      });
    }

    if (url.endsWith("/api/v1/records")) {
      return acceptedResponse("AMS-TIMEOUT");
    }

    if (url.endsWith("/api/v1/records/AMS-TIMEOUT")) {
      return confirmedRecordResponse("AMS-TIMEOUT");
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(validatedRecord, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async () => undefined,
    timeoutMs: 5,
    maxAttempts: 3
  });

  assert.equal(result.ok, true);
  assert.equal(result.recordId, "AMS-TIMEOUT");
  assert.match(result.attempts[0]?.message ?? "", /timed out/i);
  assert.deepEqual(calls, [
    "POST http://ams.test/api/v1/records",
    "POST http://ams.test/api/v1/records",
    "GET http://ams.test/api/v1/records/AMS-TIMEOUT"
  ]);
});

test("submitAndConfirmRecord does not resubmit after accepted record fails confirmation", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(requestLabel(input, init));

    if (url.endsWith("/api/v1/records")) {
      return acceptedResponse("AMS-456");
    }

    if (url.endsWith("/api/v1/records/AMS-456")) {
      return new Response("not found", { status: 404 });
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(validatedRecord, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async () => undefined,
    timeoutMs: 50,
    maxAttempts: 3
  });

  assert.equal(result.ok, false);
  assert.equal(result.confirmationAttempts, 3);
  assert.equal(calls.filter((call) => call === "POST http://ams.test/api/v1/records").length, 1);
  assert.equal(calls.filter((call) => call === "GET http://ams.test/api/v1/records/AMS-456").length, 3);
  assert.match(result.error ?? "", /confirmation failed/i);
});

test("submitAndConfirmRecord does not resubmit after malformed 201 response", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(requestLabel(input, init));

    if (url.endsWith("/api/v1/records")) {
      return jsonResponse({ status: "accepted" }, 201);
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(validatedRecord, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async () => undefined,
    timeoutMs: 50,
    maxAttempts: 3
  });

  assert.equal(result.ok, false);
  assert.equal(result.fatal, false);
  assert.equal(result.confirmationAttempts, 0);
  assert.equal(calls.filter((call) => call === "POST http://ams.test/api/v1/records").length, 1);
  assert.match(result.error ?? "", /malformed 201/i);
});

function validateForTest(candidate: AmsRecord): ValidatedAmsRecord {
  const result = validateAmsRecord(candidate);
  if (!result.ok) {
    throw new Error(`Invalid test fixture: ${result.issues.join("; ")}`);
  }
  return result.record;
}

function requestLabel(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): string {
  return `${init?.method ?? "GET"} ${String(input)}`;
}

function acceptedResponse(recordId: string): Response {
  return jsonResponse({ recordId, status: "accepted", receivedAt: "2026-06-17T00:00:00.000Z" }, 201);
}

function confirmedRecordResponse(recordId: string): Response {
  return jsonResponse({ recordId, ...record });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}
