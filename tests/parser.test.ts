import test from "node:test";
import assert from "node:assert/strict";

import { parseModelOutput } from "../src/parser.ts";

test("parseModelOutput extracts fenced JSON wrapped in prose", () => {
  const output = `Here is the extracted information:\n\n\`\`\`json\n{"insuredName":"Blue Oak Industries LLC","annualRevenue":"$4.2M"}\n\`\`\`\n\nLooks good.`;

  assert.deepEqual(parseModelOutput(output), {
    insuredName: "Blue Oak Industries LLC",
    annualRevenue: "$4.2M"
  });
});

test("parseModelOutput parses plain JSON", () => {
  const output = '{"insuredName":"Pelican Point Seafood House Inc","annualRevenue":850000}';

  assert.deepEqual(parseModelOutput(output), {
    insuredName: "Pelican Point Seafood House Inc",
    annualRevenue: 850000
  });
});
