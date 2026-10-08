# Run #113 — Venue module sweep (API lane, security lens) — 00-retro.md

Run #113 (2026-10-08T10:18Z fire, ~3.5h budget). Layer rotation 113%4=1 → API modules
(matches, auth, wallet, notifications, reports, venues, venues, slots, realtime); security lens.
DECISIONS.md read at Gate 0: no design/UX change in this cycle contradicts the ledger (no
Drawer/bell/EN+AR surface touched; the pipe work touches route validation only).

## Baseline + tech-debt pattern
- Baseline = f3b6127 (run #112 graphify refresh). Last 15 commits: 3 code squashes
  (#95/#96/#93) + docs/graphify — fix:feat ratio healthy, no reactive loop.
- Run #112 gates: turbo 3/3 sequential, vitest 125f/925t, tsc 0, API restarted 02:14:42Z.
  Verified this run by Reviewer B (claims≠facts): all formatCount/formatMoney call sites
  confirmed at claimed lines; **corrections: UuidParamPipe wired into 9 controllers (run #112
  claimed 12); vitest 925 not 924**; profile→`/clubs?tab=favorites` deep-link confirmed in
  source.

## Audit of the exact area to touch
- `venues.controller.ts` (full read): `addFavorite`/`removeFavorite`/`findOne` take raw
  `@Param('id')` with no shape validation — the P2-164 pipe class (P2-164's own tripwire spec
  pins admin/partner only, so this is NOT a regression of that fix; it's the player-facing
  venue routes missed by the #110 sweep, which scoped admin/partner controllers only).
  `GET /venues/suggestions` and `GET /venues` are param-less — unaffected.
  `POST /venues/:id/favorite` and `DELETE /venues/:id/favorite` + `GET /venues/:id` are the
  three raw sites.
- `get-venues.dto.ts`: `city?: string` has `@IsString` only (no `@MaxLength`); `search` capped
  at 80. An unbounded `city` reaches the ILIKE clause (P2-158 escapeLikePattern already handles
  wildcards; the gap is only length).
- `matches.service.ts` reschedule wallet math: `parseFloat(wallet_balance)` comparisons at
  :3119/:3160 feed the guarded floor predicate (SQL-level guard landed run #105 P2-155 — the
  floor lives INSIDE the UPDATE ... AND wallet_balance >= $cost, zero-rows → 400, so a float
  mis-round cannot overdraw; residual = error-message amounts may be off by a fils at 2dp
  boundaries). Boarded as P2-168 rather than churning the green money-path suites.
- Fan-out `.catch(() => undefined)` sites (~10 across matches/users/activities/follows) —
  fire-and-forget by design, but silent; violates the P2-125 observability discipline. Boarded
  P2-169.
- Standing sweeps CLEAN: zero console.* in apps/api/src; zero ::uuid casts in module SQL; all
  scheduler catches carry Sentry scopes (P2-125 holds); ILIKE terms uniformly escapeLikePattern'd.

## Findings → severity → action
- IMPORTANT `API-VEN-001` raw :id params on venues controller → **build this run** (small,
  same house pipe, extends P2-164's class to the player surface; venues service paths all
  404-on-no-match + parameterized, so hygiene/normalization like P2-164 itself).
- MINOR `API-VEN-002` city DTO unbounded → **build this run** (1 line + spec pin).
- IMPORTANT `API-MAT-001` reschedule parseFloat pre-check amounts → P2-168 (do NOT churn
  green money suites without a driving need; SQL floor guard holds).
- MINOR `API-MAT-002` silent fan-out catches → P2-169.
- P2-167 (boarded run #112): INNER→LEFT JOIN owner sweep both queries → **build this run**.

## Admin state check
Not an admin-area item; apps/admin untouched this run. No dirty files anywhere (tree clean at
preflight; re-checked before commits).

## Veto clocks (decision recorded)
Proposed 2026-10-00T02:30Z → elapse 2026-00-09T02:30Z. Now = 2026-10-08T10:18Z = ~32h elapsed
< 48h → **no clock row buildable this run**. Run #112's report line "run #113 is the FIRST run
allowed to build elapsed rows" was an arithmetic error (10-07T02:30 + 48h = 10-09T02:30, and
#113 fires 10-08T10:15Z — 32h in). Runs #114 (15:15Z 10-08) and #115 (01:15Z 10-09) also fire
before elapse; **run #116 (10:15Z on 10-09) is the first eligible**. This run picks non-clock
items only (P2-167 + the two venues-controller hardening riders). Recorded in BOARD + report.
