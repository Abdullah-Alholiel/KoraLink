# Run #198 — Gate 0 Retro + Program Design (compact)

## Gate 0 — Retrospective (admin lane, 198%4=2)

- Verified #197 claims BEFORE building (claims≠facts): legacy `POST /wallet/topup` 404 live via
  :3001 funnel; squash `b805c97` at origin/staging; served wallet chunk `page-0785c4812994cc8a`
  carries tri-state markers, zero legacy-fetch strings; reconcile sweep ASC; Sentry/journald clean
  (no new signatures in 24h). P2-331 verification PASSED.
- DECISIONS.md read first — no owner standard contradicts this run's work (settings-page history
  P2-104/55/106 establishes the exact patterns extended here).
- Hex audit: all 10 metrics AT baseline (clean). Reviewer A hex check: zero new import-arrow
  violations; one pre-existing admin→partner concrete import (pitches.service.ts:12, documented
  delegation) flagged as baseline-adjacent — do not let accrete.
- Reviewer A found a second real defect in the P2-322 target file (page-scoped saved/saveError
  banners → cross-card bleed + stale "Saved") — folded into the same PR (P2-323 same-PR precedent).
- Board-row premise correction (claims≠facts): P2-322's "save under a failed read" half was ALREADY
  covered (failed first read → LoadError branch unmounts the form). The REAL gap = the stale path
  (`stale=true`, socket dropped post-connect) still renders working Save buttons. Re-scoped before
  building.

## Gates 1-3 — Program Design (both items, compact)

### Item 1: P2-322 settings stale-save guard (zeroshot lane 01a1c311, PR #233)
- **Scope:** while `stale` (socket connected-then-dropped per P2-55 semantics), disable all Save
  buttons + amber `role="status"` notice `hq.settingsStaleNoSave` (EN+AR); auto-unblock on
  reconnect. Per-setting save state (savingKey/savedKey/saveErrors per key; spinner + inline
  Saved./error on their card; savedKey clears on that field's next edit). Dead `initialize()`
  removed (zero callers).
- **Contract:** no API changes; i18n +1 key both locales; write serialization preserved (one
  in-flight save). Poll-only loads (never-connected socket, `stale=false`) keep saves enabled —
  accepted per P2-55 baseline semantics (PR-Agent MINOR triaged, documented follow-up).
- **Gates:** admin tsc 0 · turbo 3/3 (lane + real tree) · CI 8/8 · PR-Agent "No security concerns".

### Item 2: P2-314 age-out alert slice (parent-built, PR #234)
- **Scope:** pending top-up intents older than 1h → ONE Pino warn + `Sentry.captureMessage`
  (warning, intentId tag) per intent, process-lifetime Set dedup with eviction of resolved ids
  BEFORE the empty-backlog early-return (behavioral spec caught the first placement as dead code
  on empty ticks). `ReconcileOutcome.agedOut` counter. Fires regardless of Moyasar-list
  visibility. No new credit path (verifyTopup guards untouched — spec-pinned).
- **Contract:** no API surface change; ReconcileOutcome gains `agedOut` (internal consumers
  updated); alert-then-resurface re-alerts by design (documented trade-off, spec-pinned).
- **Gates:** api tsc 0 · reconcile spec 23/23 · CI 8/8 (+ r2 re-review on the eviction commit).
