# NOTES

## Run command

Start the local stub in one terminal:

```bash
node stub/server.js
```

Then run the pipeline in another terminal:

```bash
npm start
```

## Approach

I treated this as a small governed intake workflow, not just an extraction script. The model is useful for getting to a draft, but the email remains the system of record and the AMS only receives a payload after parsing, normalization, source reconciliation, schema validation, submission, and confirmation.

The CLI intentionally prints both stage progress and a final intake audit. For each email, the audit shows the final status, record ID when confirmed, corrected fields, retry count, and any action needed. Corrections carry `modelValue`, `finalValue`, `evidenceSnippet`, and a human-readable reason so an operator can understand why the pipeline overrode the model.

## Governance choices

- Source beats model confidence. Pelican revenue is submitted as `null` because the email says revenue is TBD, and Sundance uses the PO Box because the email explicitly says mail sent to the facility sits in the office.
- The validation boundary is explicit. `AmsRecord` is a schema-shaped candidate; `ValidatedAmsRecord` means the final strict Zod schema accepted it as safe to submit. The normalizer can carry imperfect candidate values plus actionable issues long enough to report them, but the AMS client only accepts the branded validated form.
- AMS writes are treated carefully. A `200` is never success, a `201` must contain an accepted record ID, and success is only reported after `GET /api/v1/records/:id` returns the saved payload. If a `201` is malformed or confirmation fails, the pipeline does not blindly retry the write because the AMS may already have saved the record.
- Failures are handoff states, not dead ends. Local validation issues become `failed_needs_review`; retry/confirmation problems become `failed_submission` with enough detail for an operator to decide what to do next.

## What I cut for time

- Durable job state, resumability, and persisted audit logs.
- Idempotency-key support for AMS writes. The stub does not expose this, but I would require it before retrying ambiguous production writes.
- Field-level evidence for every field. This implementation records evidence for corrections; production should capture provenance for all submitted fields.
- Confidence scoring and threshold-based human review queues.
- A human review UI. The CLI statuses are the minimal handoff surface for this takehome.
- Broad unit coverage for every normalizer branch. I kept tests focused on parser behavior, source-grounded corrections, AMS confirmation semantics, and the final validation boundary.

## What I would not ship as-is

The source reconciliation is intentionally narrow and regex-based because the assignment has three emails. In production, I would replace it with field-level evidence extraction: each field would carry source snippets, model value, normalized value, confidence, correction history, and human override history. Low-confidence fields, source/model contradictions, and unsupported required fields would route to a review queue instead of being silently corrected.

The current audit is terminal-only. In production I would persist each run, field decision, API attempt, response body classification, confirmation result, and operator action. That durable audit trail is important for debugging carrier integrations and for explaining why a record entered an AMS in a particular state.

Unknown model fields are currently dropped when the normalizer builds the AMS candidate. That is safe for submission, but a production governance layer should record ignored or unsupported model fields as part of the intake audit.

## Decision I am confident about

I am confident that AMS confirmation should be separate from submission. The pipeline only treats a record as successful after a valid `201` and a reliable lookup confirms the saved payload. This prevents silent loss when an integration returns malformed or misleading success responses.

## Decision I am less sure about

For this takehome, I auto-correct source-grounded contradictions when the email is explicit. In production, I would make that threshold configurable by agency, line of business, and downstream risk. Some fields should be auto-corrected with evidence; others should go to review even when the source appears clear.
