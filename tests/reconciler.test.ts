import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeExtractedRecord } from "../src/normalizer.ts";
import { reconcileWithSource } from "../src/reconciler.ts";

const email1 = readFileSync("inbox/email_1.txt", "utf8");
const email2 = readFileSync("inbox/email_2.txt", "utf8");
const email3 = readFileSync("inbox/email_3.txt", "utf8");

test("Blue Oak model fields normalize into AMS formats", () => {
  const normalized = normalizeExtractedRecord({
    insuredName: "Blue Oak Industries LLC",
    dba: "Blue Oak Manufacturing",
    mailingAddress: {
      street: "4180 Commerce Park Dr, Suite B",
      city: "Waco",
      state: "Tex.",
      zip: "76712"
    },
    lineOfBusiness: "general liability",
    effectiveDate: "07/01/2026",
    annualRevenue: "$4.2M",
    contactEmail: "maria@blueoakmfg.com"
  });
  const reconciled = reconcileWithSource(normalized.record, email1);

  assert.equal(reconciled.record.mailingAddress.state, "TX");
  assert.equal(reconciled.record.lineOfBusiness, "general_liability");
  assert.equal(reconciled.record.effectiveDate, "2026-07-01");
  assert.equal(reconciled.record.annualRevenue, 4200000);
});

test("Pelican revenue is overridden to null when source says TBD", () => {
  const normalized = normalizeExtractedRecord({
    insuredName: "Pelican Point Seafood House Inc",
    dba: null,
    mailingAddress: {
      street: "2217 Shoreline Blvd",
      city: "Mobile",
      state: "AL",
      zip: "36605"
    },
    lineOfBusiness: "workers_compensation",
    effectiveDate: "2026-07-01",
    annualRevenue: 850000,
    contactEmail: "curtis@pelicanpointseafood.com"
  });
  const reconciled = reconcileWithSource(normalized.record, email2);

  assert.equal(reconciled.record.annualRevenue, null);
  assert.deepEqual(reconciled.corrections.map((correction) => correction.field), ["annualRevenue"]);
  assert.match(reconciled.corrections[0]?.evidenceSnippet ?? "", /revenue is TBD/i);
});

test("Sundance mailing address is corrected to the PO Box from source email", () => {
  const normalized = normalizeExtractedRecord({
    insuredName: "High Desert Holdings LLC",
    dba: "Sundance Storage",
    mailingAddress: {
      street: "880 Frontage Rd",
      city: "Bend",
      state: "OR",
      zip: "97701"
    },
    lineOfBusiness: "commercial_property",
    effectiveDate: "8/15/26",
    annualRevenue: 950000,
    contactEmail: "gary.hudd@sundancestorage.com"
  });
  const reconciled = reconcileWithSource(normalized.record, email3);

  assert.deepEqual(reconciled.record.mailingAddress, {
    street: "PO Box 1142",
    city: "Bend",
    state: "OR",
    zip: "97709"
  });
  assert.deepEqual(reconciled.corrections.map((correction) => correction.field), ["mailingAddress"]);
});
