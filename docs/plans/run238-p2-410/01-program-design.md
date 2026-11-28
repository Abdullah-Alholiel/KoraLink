# Run #238 — Program Design (Gates 1–3 compact): P2-410 admin a11y slice

## Problem (Gate 1)
Screen readers cannot announce which outcome (resolved/dismissed) is selected on the report-detail page, and repeated resolve failures don't re-announce. Timeout errors fall into the wrong error class in the admin error classifier.

## User story
As an HQ operator using a screen reader, I can tell which outcome chip is active, hear failure messages announced (and re-announced on each retry), and get a network-classified timeout error instead of an unclassified generic.

## Scope
IN: aria-pressed ×2 (reports/[id] outcome chips), role="alert" + saveSeq key ×2 (saveError renders), api.ts timeout throw → ApiError(0) (network bucket), 1 vitest file.
OUT: everything else (use-data exemption per P2-400d; disputes/audit per-button affordances; loading consistency; audit actor search — all separate backlog rows).

## Contracts (Gate 3)
- No API shape changes, no i18n key changes (zero new copy — no parity churn).
- `ApiError(message, 0)` — no `code`; classifyApiError: status 0 without code 'OFFLINE' → 'network' bucket (verified against PR #307's offline guard).
- Caller-initiated abort (options.signal?.aborted) still rethrows untouched.
- saveSeq: incremented in resolve()/saveEdit() catch before setSaveError, keys both <p role="alert">.

## Gate 3 verification checklist
- [x] No mutation contract touched (read-only page + error surfaces).
- [x] Frontend types unchanged — no adapter/API-shape deltas.
- [x] classifyApiError status-0-without-code path verified by code read of lib/api.ts:204,244-246.
- [x] disputes/[id] re-announcement pattern (role="alert" key={save-N}) read and mirrored.
- [x] Test pins defined before build (aria-pressed flip, role=alert presence, ApiError(0) from timeout).

## Observability
No new telemetry surfaces (UI-attribute + error-shape fix); existing Sentry/Pino coverage unchanged.

## Build
Zeroshot lane 01a21fc4 (Claude Opus 5.5 author) in worktree run238-p2-410 → parent reconciles diff, runs REAL gates (admin tsc 0 · admin vitest green · turbo --concurrency=1 --filter=admin) → PR → bot checks → squash-merge → main-tree build + admin restart + served-chunk greps.
