import test from "node:test";
import assert from "node:assert/strict";

import { submitAndConfirmRecord } from "../src/amsClient.ts";
import type { AmsRecord } from "../src/types.ts";

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

test("submitAndConfirmRecord retries malformed 200 and only succeeds after GET confirmation", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);

    if (url.endsWith("/api/v1/records") && calls.length === 1) {
      return new Response('{"status":"accepted"}', {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (url.endsWith("/api/v1/records")) {
      return new Response('{"recordId":"AMS-123","status":"accepted","receivedAt":"2026-06-17T00:00:00.000Z"}', {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }

    if (url.endsWith("/api/v1/records/AMS-123")) {
      return new Response(JSON.stringify({ recordId: "AMS-123", ...record }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("not found", { status: 404 });
  };

  const result = await submitAndConfirmRecord(record, {
    baseUrl: "http://ams.test",
    fetchFn,
    sleep: async () => undefined,
    timeoutMs: 50,
    maxAttempts: 3
  });

  assert.equal(result.ok, true);
  assert.equal(result.recordId, "AMS-123");
  assert.equal(result.attempts.length, 2);
  assert.match(result.attempts[0]?.message ?? "", /malformed 200/i);
  assert.deepEqual(calls, [
    "POST http://ams.test/api/v1/records",
    "POST http://ams.test/api/v1/records",
    "GET http://ams.test/api/v1/records/AMS-123"
  ]);
});
