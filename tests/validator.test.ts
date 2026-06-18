import test from "node:test";
import assert from "node:assert/strict";

import { validateAmsRecord } from "../src/validator.ts";
import type { AmsRecord } from "../src/types.ts";

const validRecord: AmsRecord = {
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

test("validateAmsRecord returns a validated record for AMS-safe payloads", () => {
  const result = validateAmsRecord(validRecord);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("Expected validation to pass");
  assert.deepEqual(result.record, validRecord);
});

test("validateAmsRecord returns actionable issues for invalid candidates", () => {
  const result = validateAmsRecord({
    ...validRecord,
    mailingAddress: { ...validRecord.mailingAddress, state: "Tex.", zip: "76712-1234" },
    effectiveDate: "07/01/2026",
    contactEmail: "not-an-email"
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("Expected validation to fail");
  assert.deepEqual(result.issues, [
    "mailingAddress.state: required 2-letter USPS code",
    "mailingAddress.zip: required 5-digit ZIP",
    "effectiveDate: required YYYY-MM-DD",
    "contactEmail: invalid email"
  ]);
});

test("validateAmsRecord rejects impossible calendar dates", () => {
  const result = validateAmsRecord({
    ...validRecord,
    effectiveDate: "2026-13-05"
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("Expected validation to fail");
  assert.deepEqual(result.issues, ["effectiveDate: invalid calendar date"]);
});

test("validateAmsRecord rejects unknown fields before AMS submission", () => {
  const candidate = {
    ...validRecord,
    carrierOverride: "do-not-submit"
  };

  const result = validateAmsRecord(candidate);

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("Expected validation to fail");
  assert.deepEqual(result.issues, ['unrecognized field: "carrierOverride"']);
});
