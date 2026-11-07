# Run #115 — Program Design (compact; Gates 1-3 in one doc, autonomous mode)

## Problem
Three hardening gaps in the DB/API money + observability layer:
1. Reschedule/create wallet math routed numeric(12,2) strings through
   `parseFloat` floats (P2-168 — fils-level drift in 400 messages; latent
   500s on vanished user rows).
2. Eight fire-and-forget fan-outs swallowed all failures (P2-169).
3. `matches_location_gist_idx` not in the journaled migration chain (P2-171,
   Reviewer A run #115) — fresh rebuilds lose the discovery-feed index.

## Scope
IN: money helpers module, cents-based floor/messages, zero-rows guards,
fanout reporter + 8 call sites, migration 0047 + journal/snapshot contract.
OUT: PSP decisions (P0-2), new endpoints, UI changes, i18n, otp-store mutex
(intentional semantics), CONCURRENTLY index builds (PR-Agent MINOR accepted).

## Exact contracts
- `moneyToNumber(raw: string|number|null|undefined): number` — normalize via
  quantizeMoney2dpString, then Number(). Malformed → 0.
- `centsFromMoneyString(raw): number` — Math.round(moneyToNumber * 100).
- `centsToMoneyString(cents): string` — (cents/100).toFixed(2).
- `pitchCostFromHourlyRate(rate, durationMins): number` — exact cents:
  Math.round(cents(rate) * durationMins / 60) / 100.
- `reportFanOutError(scope: string, err: unknown): undefined` — Sentry
  captureException iff status missing or ≥500; Nest Logger warn always.
- 400 message format preserved exactly:
  `Insufficient wallet balance for the reschedule. Required: SAR <x>, Available: SAR <y>`
- Migration 0047: `CREATE INDEX IF NOT EXISTS matches_location_gist_idx ON
  matches USING GIST (location);` + journal entry {idx:48, version:'7',
  breakpoints:true, when > 1791338660040} + snapshot (copy of 0046
  declaration-serialization, fresh id, prevId→0046.id).

## Files
| File | Change |
|---|---|
| apps/api/src/common/utils/money.ts | NEW — money primitives |
| apps/api/src/common/utils/fanout.ts | NEW — reportFanOutError |
| apps/api/src/modules/matches/matches.service.ts | cents math in reschedule/create; imports |
| apps/api/src/modules/matches/match-fees.ts | cents guard + zero-rows |
| apps/api/src/modules/wallet/wallet.service.ts | cents guard + zero-rows |
| apps/api/src/modules/{follows,activities,users}/*.service.ts | fanout reporter at 3 sites |
| apps/api/src/modules/matches/matches.money-exact.spec.ts | NEW — 10 cases |
| apps/api/drizzle/0047_matches_location_gist.sql | NEW |
| apps/api/drizzle/meta/_journal.json | entry idx 48 |
| apps/api/drizzle/meta/0047_matches_location_gist_snapshot.json | NEW |

## Verification evidence (actual outputs)
- Lane gates: api tsc 0; money-exact 10/10; reschedule+wallet suites 7/54 and
  4/33 across the two checkpoints.
- PR #100: 4/4 bot checks green (gate 3m, review, semgrep, fresh-apply);
  PR-Agent 1 MINOR triaged (CONCURRENTLY — accepted follow-up, 0036 precedent).
- Squash `b11a137` merged to staging; merged-tree gates: turbo
  --concurrency=1 --force 3/3 (3m25s); vitest 125 files/925 tests; api tsc 0;
  api jest 105 suites/934 tests.
- Migration applied via scripts/migrate-vps.mjs: "applied
  0047_matches_location_gist.sql … 1 applied, 48 skipped" with the
  `already exists, skipping` NOTICE (idempotency + when-rule proof).
- Tripwire suites after journal fix: drizzle-migration-journal +
  drizzle-snapshot-chain 2 suites / 8 tests green; chain walk 22 links valid.
- API restarted 02:29Z; /health 200; dist grep carries the new guard string.

## Status
| Gate | Status |
|---|---|
| 0 Retro | ✅ autonomous (00-retro.md) |
| 1-3 Compact | ✅ this doc |
| Gate 4 Slices | ✅ slice 1 (code+specs) + slice 2 (migration) — PR #100 merged |
