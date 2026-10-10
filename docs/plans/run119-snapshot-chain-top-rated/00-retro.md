# Run #119 — Cycle: snapshot-chain repair + P2-173 top-rated venue sort

## Gate 0 — Retro (compact)

**Baseline:** 60dfc21 (P1-63 squash, run #118) → 48be5e2 (graphify refresh).

- **P1-63 verified DONE (claims ≠ facts):** Reviewer B CONFIRMED all 5 claims (cron name/06:17 UTC, 7d window on updated_at + status + flag=false, reopen resets flag, admin chip+CSV+timeline+i18n 8/8, migration 0049 + journal idx 50). Live E2E evidence: 0 overdue candidates left post-06:17Z tick (tick correctly no-opped; zero-work ticks are silent by design — `if (escalated > 0)` log guard), 2 escalated rows live from run #118's probe. Promoted to DONE on BOARD.
- **Reviewer A IMPORTANT (fixed this run):** 0048/0049 snapshots CONTENT-STALE — the copy-previous-snapshot raw-SQL convention shipped drift: 0048's snapshot lacked `venue_reviews` + carried dead `venues.rating`; 0049 inherited both and lacked `disputes.sla_escalated`. Chain ids were valid (tripwires only check links, not content) so CI never caught it. **Lesson → add to pitfalls: the copy-previous convention requires a content diff vs the previous snapshot; the next hand-written migration must reconcile from the last CONTENT-TRUE snapshot, not the last file.**
- **Sentry triage:** venue_favorites cluster = OLD (bounded 10-07, table live since 0046 — resolved-verify per run #115); Neon quota errors = pre-cutover (≤09-25, old project); CORS 127.0.0.1:3402 noise; EADDRINUSE one-off from a restart race. No new actionable clusters. koralink-web: viewport-diagnostic noise + pre-existing SW/hydration items. Nothing boarded.
- **DECISIONS.md consulted (Gate 0 supremacy):** no design/UX decisions this cycle touch the ledger. P2-173 adds a sort option + chip — additive, no ledger conflict (admin Drawer rule untouched; PWA chips row follows existing clubs-page patterns).

## Gates 1–3 — Program design (compact; both items)

### Item 1: snapshot repair (hardening) — PR #106 `fix/run119-snapshot-chain` (15aa1de)
Rebuild 0048/0049 snapshot content from the true 0047 base + each migration's SQL. Ids preserved (0048 id/prevId unchanged; 0049 fresh id, prevId=0048). Verified vs live staging DB: users 28/28, disputes 13+sla_escalated, venues rating_avg/rating_count in / rating out. Tripwires 8/8. CI fresh-apply on the PR replays the chain independently.

### Item 2: P2-173 "Top Rated" venue sort (user-visible) — lane branch `lane/p2-173-top-rated`
- **API:** `GetVenuesDto.sort?: 'distance'|'top_rated'` (IsIn, default unchanged); `findNearby` SELECT + `v.rating_avg::float8 AS rating_avg, v.rating_count::int AS rating_count`; ORDER BY top_rated = `rating_avg DESC NULLS LAST, rating_count DESC, v.name ASC` (coords-independent — user picked rating over proximity); sort NEVER touches WHERE (additive-only rule); no index at ~50 venues.
- **PWA:** raw row type + `rating_avg?/rating_count?`; adapter maps `ratingAvg ?? null / ratingCount ?? 0`; `buildVenueQuery()` extracted into `src/lib/venue-query.ts` (+test); "Top Rated" toggle chip in existing clubs filter-chips row, default OFF, ON → `sort=top_rated`; existing 5 UX states keep handling the surface.
- **i18n:** `clubs.topRated` EN "Top Rated" / AR "الأعلى تقييماً", leaf-key parity both files.
- **Tests:** api `venues.sort.spec.ts` (3 cases: default unchanged, top_rated order with NULL last, coords+top_rated = rating order); pwa `test/venue-query.test.ts` + structure test.
- **Contract:** default = today's exact behavior; invalid sort → 400.

## Gate 3 contract checklist
- [x] Sort param optional + IsIn-validated → 400 on junk
- [x] New SELECT columns nullable-safe (NULL rating → null, count → 0 in adapter)
- [x] No mutation endpoints touched (read-only sort) → mutation-return rule N/A
- [x] i18n keys in BOTH locales before UI merges
- [x] Snapshot chain ids preserved → tripwire spec still green (parent-verified 8/8)

## Status

| Gate | Name | Status |
|------|------|--------|
| 0 | Retrospective | ✅ done (this file) |
| 1–3 | Program design | ✅ compact (this file) |
| 4 | Vertical slices | Item 1: PR #106 · Item 2: lane PR pending |
