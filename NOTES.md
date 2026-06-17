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

## What I prioritized

I treated the extraction service as a useful but fallible parser, not as the source of truth. The pipeline keeps the email as the system of record, normalizes the model output into the AMS schema, reconciles high-risk fields against the source email, and only marks an AMS submission as successful after confirming the saved record with `GET /api/v1/records/:id`.

The CLI prints the workflow stages and a final intake audit so an operator can see which records were corrected, which attempts retried, and what action would be needed if a record could not be confirmed.

## What I cut for time

- A durable job queue or resumable workflow state.
- A full evidence extraction engine for arbitrary insurance emails.
- A human review UI.
- Broad unit coverage for every normalizer branch.
- Structured logging/metrics beyond the terminal audit.

## What I would not ship as-is

The source reconciliation is intentionally narrow and regex-based because the assignment has three emails. In production, I would replace this with field-level evidence extraction: each field would carry a confidence score, source snippets, model value, normalized value, and human override history. Low-confidence or contradictory fields would route to a review queue instead of being silently corrected.

The retry loop is also in-memory. A production version should persist attempt state, use idempotency keys where the AMS supports them, and expose enough operational telemetry to distinguish rate limiting, upstream hangs, malformed responses, and validation defects.

## One decision I am confident about

A `200` from the AMS is not success. The pipeline only accepts a `201` with a record ID and then confirms the saved record through the reliable lookup endpoint. This prevents silent loss when an integration returns malformed or misleading success responses.

## One decision I am less sure about

For this takehome, I auto-correct source-grounded contradictions like Pelican's revenue and Sundance's mailing address. In a real Terminal workflow, I would make the threshold configurable by agency/workflow and likely route some corrections to human review depending on downstream risk.
