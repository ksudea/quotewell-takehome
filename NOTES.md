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

I treated this as an intake workflow with explicit control points, not just an extraction script. The model is useful for getting to a draft, but the email remains the system of record. The AMS only receives a payload after parsing, normalization, source reconciliation, schema validation, submission, and confirmation.

The CLI prints stage progress and a final intake audit. For each email, the audit shows the final status, record ID when confirmed, corrected fields, retry count, and any action needed. Corrections carry `modelValue`, `finalValue`, `evidenceSnippet`, and a plain-English reason so a reviewer can understand why the submitted value differs from the model output.

## Control points

- Source evidence takes priority over model output. Pelican revenue is submitted as `null` because the email says revenue is TBD, and Sundance uses the PO Box because the email explicitly says mail sent to the facility sits in the office.
- The validation boundary is explicit. `AmsRecord` is a schema-shaped candidate; `ValidatedAmsRecord` means the final strict Zod schema accepted it as safe to submit. The normalizer can carry imperfect candidate values plus actionable issues long enough to report them, but the AMS client only accepts the branded validated form.
- AMS writes are handled as potentially non-idempotent operations. A `200` is never success, a `201` must contain an accepted record ID, and success is only reported after `GET /api/v1/records/:id` returns the saved payload. If a `201` is malformed or confirmation fails, the pipeline does not blindly retry the write because the AMS may already have saved the record.
- Retry behavior is limited to cases where the assignment's AMS can recover safely enough for a local exercise: `429` with `Retry-After`, server errors, malformed `200`, and request timeouts. In production, timeouts are ambiguous; I would pair retries with idempotency keys or a reconcile-before-write lookup instead of assuming the previous write failed.
- Failure states are designed for handoff. Local validation issues become `failed_needs_review`; retry/confirmation problems become `failed_submission` with enough detail for a person to decide the next step.

## Scope choices for this version

- Run state is in memory because the stub is local and deterministic. A production integration should persist job state, attempt history, and confirmation results.
- Idempotency-key support belongs at the AMS write boundary. The stub does not expose it, but I would require idempotency before retrying ambiguous production writes.
- Evidence tracking is focused on fields where the pipeline changed or rejected the model output. A full provenance layer for every submitted field would be the next production boundary, but implementing that generically would be larger than this three-email exercise.
- Human review is represented as CLI statuses and action-needed text. A production system should route reviewable records into a durable queue with ownership and resolution history.
- Tests focus on the assignment's highest-risk paths: parser behavior, source-grounded corrections, AMS confirmation semantics, retry behavior, malformed acceptance responses, and the final validation boundary.

## What I would not ship as-is

For this assignment, the audit shows evidence where the system changed or rejected the model output. In production, I would expand that into field-level evidence extraction for every submitted field: source snippet, model value, normalized value, confidence, extraction method, correction history, and human override history. Low-confidence fields, source/model contradictions, and unsupported required fields would route to a review queue instead of being silently corrected.

I did not build a universal evidence extractor here because, with three fixed emails, it would mostly become a collection of field-specific regexes that look more complete than they really are. The production version should be designed as a first-class evidence model, not bolted onto a small fixture parser.

The current audit is terminal-only. In production I would persist each run, field decision, API attempt, response body classification, confirmation result, and operator action. That durable audit trail is important for debugging carrier integrations and for explaining why a record entered an AMS in a particular state.

Unknown model fields are currently dropped when the normalizer builds the AMS candidate. That is safe for submission, but a production intake service should record ignored or unsupported model fields as part of the audit.

## Decision I am confident about

I am confident that AMS confirmation should be separate from submission. The pipeline only treats a record as successful after a valid `201` and a reliable lookup confirms the saved payload. This prevents silent loss when an integration returns malformed or misleading success responses.

## Decision I am less sure about

For this assignment, I auto-correct source-grounded contradictions when the email is explicit. In production, I would make that threshold configurable by agency, line of business, and downstream risk. Some fields should be auto-corrected with evidence; others should go to review even when the source appears clear.
