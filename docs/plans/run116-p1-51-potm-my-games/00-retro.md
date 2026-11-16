# Run #116 — P1-51 POTM-on-my-games — Gate 0 Retrospective

**Item:** P1-51 — "No post-match rating / MVP flow". Veto-clock default (proposed run #109,
elapsed 2026-10-09T02:30Z, no veto in chat/BOARD as of this run's re-check): **extend the
existing POTM vote — no new per-player rating entity.**

## ADMIN STATE CHECK
This item does NOT touch `apps/admin` or partner/admin API surface — no admin-hold check needed.
Verified: `git status --short` clean (prestate), no dirty admin paths at 10:18Z.

## Area audit (what exists TODAY — verified by reading live code)
- **Backend POTM is COMPLETE** (`apps/api/src/modules/matches/matches.service.ts`):
  - `castVote` (:3814+): roster-only, no_show=false, no self-vote, one vote per voter
    (unique index `match_votes_voter_match_idx`, schema.ts:608), change-vote supported.
  - `pom-result` endpoint (`GET /matches/:id/pom-result`, controller :280) returning
    voting_open / completed / no_winner / no_votes / not_completed union.
  - 24h window: `VOTING_WINDOW_HOURS=24` (:237 area), `finalizePomVoting` sweep (:444-509)
    — idempotent (guard `pom_winner_id IS NULL AND pom_announced_at IS NULL`), 50/tick,
    tie → stamp `pom_announced_at` (no winner), logs + WS broadcast on announce.
- **DB truth:** `matches.pom_winner_id` + `matches.pom_announced_at` (schema.ts:448-450),
  `match_votes(candidate_id, voter_id, match_id)` (schema.ts:588-612).
- **PWA:** full `pom.*` i18n ns (29 keys EN+AR parity), `usePomResult` hook + `PomResult`
  union, `PostMatchSection` (detail page), MatchCard in-window vote pill (Active tab).
  my-games page: Active tab already keeps voting-open matches visible 24h (page.tsx:50-58).
- **my-games SQL** (`users.service.ts getMyMatches` :206-256): carries `has_voted` +
  `voting_closes_at` — but NO winner fields, so History rows cannot show the POTM outcome.

## Reviewer findings absorbed into this cycle
- Reviewer B (run #116): **stale docstring** at `matches.service.ts:449-452` — claims
  "Tie → earliest vote wins" but code stamps tie as no-winner (:489-501). Fix the comment
  in this cycle (P1-51 touches this exact function).
- Reviewer B (run #116): my-games History rows show no POTM result; winner visible only
  via match detail. → THE gap this slice closes.
- Reviewer A (run #116): audit.controller.ts:25 inlines its own LIKE-escape instead of the
  shared helper — MINOR, inconsistent not broken. Boarded as follow-up, NOT in this slice
  (different area, would churn a clean file without a driver; P2-168 driver-rule applies).
- Reviewer A (round2/slot-lock MINORs on money code): recorded on the P2-168 board row as
  follow-up context — not built (driver rule).

## Tech debt / contract notes
- `getMyMatches` LIMIT 50 + ORDER BY status-bucket — additive-only change below keeps it.
- All ID columns varchar(36) → any new SQL predicate uses `::text` (never ::uuid).
- `adaptNearbyMatch` passes extra columns through untouched; the Match type carries the
  new fields as optional → zero risk to feed adapter consumers.
- MatchCard tests exist (`test/components/MatchCard.test.tsx`, 17 cases) — new states must
  not regress them; new cases added there.

## Fix:feat ratio (last 15 commits)
Docs/kanban: 6 · fixes: 3 (money, LEFT-join, search i18n) · feat: 2 — healthy, not reactive.

## Verdict
PROCEED to Gate 1-3 (compact) → Gate 4 vertical slice. The slice is backend extension +
adapter + MatchCard render-only states + tests; zero migration (columns already live).
