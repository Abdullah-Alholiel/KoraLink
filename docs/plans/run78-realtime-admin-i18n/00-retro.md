# Run #78 — Realtime hardening + Admin settings i18n — Gate 0 Retrospective

**Mode:** full (2-item build + verification batch) · **Lane:** zeroshot `01a0de5e` (Claude Opus 5.5) for item 1 · PR flow for both items.

## Baseline
staging `343b0bf` (run #77 tip). Run #77 claims (P2-109 `ba77311`, P2-113 `58d1248`) → **BOTH VERIFIED** by Reviewer B
(deleg_00fa084c): squashes present, code matches claims, lane suites re-run live 14/14. Promoted DONE.

## Area audit (what the run touched)
- `apps/api/src/modules/gateway/` — rate limiter + gateway handlers. Recent debt: the rate limiter's own doc comment
  advertised the reconnect loophole as "accepted design" (self-defeating comment); WS handlers had no payload-shape
  validation (WS bypasses class-validator entirely).
- `apps/admin/src/app/(dashboard)/settings|users` — P2-104 labels hardcoded English (known); save/action failures
  swallowed by un-guarded try/finally (found by Reviewer A this run).

## Findings → actions
| Source | Finding | Action |
|---|---|---|
| Hunt (MEDIUM) | rate-limit buckets refill on reconnect | **built (P2-114, PR #39)** |
| Hunt (LOW) | WS clientMessageId unbounded → raw PG error | **built (same PR)** |
| Hunt (LOW) | room ids no UUID shape check | **built (same PR)** |
| Hunt (needs_validation) | `disconnectUser` namespace.in() + Redis adapter cross-node disconnect | recorded, revisit with koralink-realtime-scaling (single-VPS today) |
| Reviewer A (IMPORTANT) | settings/users save failures invisible | **built (PR #38)** |
| Reviewer A (IMPORTANT) | settings.set() writes have no audit.log row | **boarded (new item, next run)** |
| Reviewer A (IMPORTANT) | last-admin guard count+update not in one tx, no FOR UPDATE | **boarded (new item, next run)** |
| Reviewer A (MINOR) | UpdateSettingDto unbounded (`value: unknown`, any key) | **boarded (folds into the settings-validation item)** |
| Reviewer B (P0-candidate) | settings PUT accepts any key + any JSON value | deduped into the same settings item (same fix surface) |
| Reviewer B (P1) | partner earnings page lacks balance/cadence picture; disputes PATCH trail thin | recorded in Findings, not boarded (needs owner product input on partner money UX) |
| Reviewer B (P2) | P2-104 + Save button + audit-page filters | P2-104 **built**; audit filters recorded on the settings item's row |

fix:feat ratio for the run's commits: 1 feat (P2-104) + 1 fix (P2-114) against 0 regressions — healthy.

## Tech-debt notes (carried, not built)
- Temp-worktree Next builds fail on UNTOUCHED apps (`next/dist/pages/_app.js` can't resolve `../shared/lib/utils`
  while resolving `next` through the main checkout). Reproduces with zero local changes; main checkout + CI clean-room
  green. Root-caused as environment pathology, not content — recorded so the next run doesn't re-burn 30 min on it.
- Reminder-ladder atomicity/ORDER-BY minors (run #77) remain latent (single-VPS), revisit at the scaling cycle.
