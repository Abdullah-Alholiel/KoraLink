# Run #211 — Program Design (compact, Gates 1–3)

## Item 1 — keep-warm @sentry/node by name (D-20261113-40)
- **Problem:** `scripts/keep-warm-render.mjs:30` requires `@sentry/node` via the absolute
  path `apps/api/node_modules/@sentry/node`; an npm hoist removes that dir and the
  systemd service fails every 10-min tick (2026-11-13: 3h Render-cold outage).
- **Change:** `createRequire('<repo>/apps/api/package.json')('@sentry/node')` — name
  resolution works hoisted (root node_modules) or nested. No dep added.
- **Acceptance (from DECISIONS.md row, executed this run):** symlink removed →
  `node scripts/keep-warm-render.mjs` exit 0, log ends `sentry_status=ok` ✅ (15:37:13Z).
  Symlink restored after proof (stopgap removal = Claude's step, post-merge, with the
  drop-in). Out of scope: systemd unit/timer/drop-in, Sentry monitor config.
- **Contract:** script CLI behavior unchanged (exit codes 0/1/2; log format unchanged).

## Item 2 — P2-375 AppealSheet localized errors (zeroshot lane 01a1e4fc)
- **Problem:** `AppealSheet.tsx:79` renders the raw backend message; caller
  `match/[id]/page.tsx:1182` passes `appeal.error?.message`. Violates the error-message
  standard (what/why/next, localized EN+AR) on a dispute-adjacent surface.
- **Design (mirror P2-372 ReportSheet):** component classifies internally —
  `errorKey(classifyError(error))` from `lib/error-classify.ts`; prop becomes the raw error
  object; visual container unchanged; reuse existing `errors.*` buckets (no new keys unless
  a bucket is genuinely absent; en/ar leaf parity must stay exact).
- **Gate 3 contract checklist:**
  - [x] No API/DTO change (client-only); backend untouched.
  - [x] Call site passes `appeal.error` (raw), not a message string.
  - [x] i18n keys exist in BOTH locales for every bucket the classifier can emit
        (verified by Reviewer B: errors.* parity 37=37 run-#210; re-verified by suite).
  - [x] No field silently undefined: `error` optional, absent → no error box (same as today).
  - [x] Tests pin: raw message NEVER rendered; ≥2 classes render distinct keys; no-error case.

## Item 3 — runbook hardening (direct docs)
- `docs/runbooks/restore-drill.md`: journal-count acceptance now derives from the repo
  journal (dynamic), not a hardcoded 60; `set -o pipefail` on the zcat|psql pipeline
  (Reviewer A IMPORTANT: truncated dump can't false-pass); acceptance comment notes 62 as
  of 0060.
- `scripts/db-restore-runbook.md`: SUPERSEDED banner → points at the prod-drill runbook,
  scopes this file to the old staging lane (Reviewer A MINOR).

## i18n / migration impact
None new (P2-375 reuses existing buckets; verify parity in the suite). No schema changes.
