# Run #172 — Gate 0-3 Compact (P2-195 residual: player dispute-tracking list)

## Gate 0 — Retro on the touched area
- Disputes logic lives in `apps/api/src/modules/matches` (createDispute matches.service.ts:4145,
  findMyDispute :4330 region, evidence append, idempotency on (match_id, reporter_id, type) for
  open statuses). Contract spec: matches.dispute-contract.spec.ts pins the MyDispute key set
  {id,type,status,decision,has_appealed,created_at,updated_at}.
- PWA side: useDisputes.ts (MyDispute type, useMyDispute per-match), ReportDisputeSheet with
  open-dispute status card (status.* keys under `dispute` namespace at ROOT scope — NOT a
  `disputes` namespace; verified en.json).
- Reports page (reports/page.tsx) is the reporter-closure surface (P2-23) with mine-list
  pagination pattern (useReports useInfiniteQuery, {reports,total,hasMore} envelope).
- DECISIONS.md consulted: no owner standard contradicted (read-only addition; no UX reversal).
- Recent debt in area: matches.service.ts:847/3231 prefer-const (P2-262, advisory) — not touched.

## Gate 1 — Product spec (compact)
- Problem: a player who files a dispute (no-show appeal or P1-69 category) can only see its
  status by revisiting that exact match. No cross-match "my disputes" list exists (verified:
  only GET /matches/:id/my-dispute; reports have /reports mine-list, disputes don't).
- User story: as a player, I open Reports → "Disputes" and see every dispute I filed, its
  live status (opened/under_review/resolved/rejected), the match it concerns, and any decision —
  so I never wonder whether my ticket is being handled.
- Scope IN: GET /matches/my-disputes (auth, mine-list, newest-first, 50-row cap), PWA hook,
  Reports page "My Disputes" section (status chips reuse dispute.status* i18n), i18n EN+AR.
- Scope OUT: admin lifecycle changes, evidence upload, reply threads, pagination (single 50-cap
  page is enough for per-player dispute volume; reports keeps its paged envelope).

## Gate 2 — Architecture (compact)
- API: `findMyDisputes(userId)` in MatchesService — LEFT JOIN matches for title + scheduled_at
  (dispute.match_id is nullable → LEFT JOIN, never inner), WHERE reporter_id = userId (an
  eq() on a NOT NULL column — safe), ORDER BY disputes.created_at DESC LIMIT 50.
- Controller: `@Get('my-disputes')` declared BEFORE `@Get(':id')` (route-order guard —
  otherwise "my-disputes" parses as an id).
- PWA: `useMyDisputes()` hook (queryKey ['disputes','mine'], staleTime 30s) + section on
  reports/page.tsx (loading spinner / empty line / error line — mirrors page's existing
  three-state pattern; shared EmptyState not used here: section is subordinate to reports list).
- i18n: reports ns gains `disputesTitle`, `disputesEmpty`, `disputesError` (EN+AR parity).
  Status chips reuse existing root `dispute.status*` keys.

## Gate 3 — Program design (contracts)
- GET /matches/my-disputes (auth) → 200:
  `[{ id, type, status, decision, has_appealed, created_at, updated_at, match_title, match_scheduled_at }]`
  (has_appealed computed from evidence json; match_title/match_scheduled_at null when match deleted).
- MatchesService.findMyDisputes(userId): Promise<MyDisputeListRow[]> — explicit TS return type.
- Frontend hook: useMyDisputes(): { disputes: MyDisputeListRow[]; isLoading; error; refetch }.
- Adapter: none (hook consumes the API shape directly — mirrors useMyDispute).
- i18n contract: reports.disputesTitle = "My Disputes"/"نزاعاتي"; reports.disputesEmpty =
  "No disputes filed"/"لا توجد نزاعات"; reports.disputesError = localized errors.* fallback.
- Contract checklist:
  - [x] Read-only endpoint — mutation return contract N/A (no writes).
  - [x] Frontend type accepts the exact JSON (MyDispute + match_title + match_scheduled_at).
  - [x] No adapter needed (direct hook consumption, existing pattern).
  - [x] No field silently undefined: LEFT JOIN nulls typed `string | null`.
  - [x] i18n keys exist in BOTH en.json + ar.json before build.

## Verification plan (Gate 3 checklist)
- jest: new spec (list shape + reporter filter + join nulls + LIMIT pin) + full matches suites.
- vitest: reports page specs extended (disputes section states) + full suite.
- turbo build sequential 3/3; tsc 0; PR flow (lane branch → checks → triage → squash).
