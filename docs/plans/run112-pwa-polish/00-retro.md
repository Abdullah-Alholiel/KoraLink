# Run #112 — Gate 0 Retrospective (PWA lane, 112 % 4 = 0)

## Area audited
Favorites surfaces (P2-161/165 arc, PRs #92/#93/#94) + admin/partner route-param
hygiene (P2-164). Baseline: `8940913` (run #111 squash) on staging.

## Recent-commit pattern
Last 8 commits: 4 feature (favorites arc, CSV), 2 fix (TOCTOU, formula-injection),
2 docs. fix:feat ratio healthy (< 1.0). No contract breaks in the arc — mutation
returns comply, favorites mutations are idempotent with explicit created/removed.

## DECISIONS.md ledger check (Gate-0 supremacy)
- Drawer RIGHT-hand standard: not touched this run.
- EN+AR marketing parity: REINFORCED this run (numerals + money formatting).
- Notification-bell-in-feed-only: untouched.
No contradictions found.

## Reviewer findings (merged, parent-verified)
| # | Source | Severity | Finding | Parent verdict |
|---|---|---|---|---|
| A-1 | Reviewer A | IMPORTANT | clubs/[id] outside (main) group — missing shell | **REFUTED** — detail renders own MobileFrame+BottomNav ([id]/page.tsx:154,561); established standalone-page pattern |
| A-2 | Reviewer A | IMPORTANT | `SAR ${displayBalance.toFixed(2)}` hardcoded (profile :379) | **CONFIRMED** — bypasses formatMoney (P2-128 convention); AR users see Latin "SAR" |
| A-3 | Reviewer A | IMPORTANT | listFavoriteVenues INNER JOIN users drops venues w/ missing owner row; ids-list vs venues-list divergence | **CONFIRMED but DEFERRED** — no code path deletes users (grep: zero `delete(users)`); theoretical only. Fixing favorites alone would diverge from findNearby (:179, same join) — consistency demands a joint sweep → new P2 row |
| B-1 | Reviewer B | IMPORTANT | Zero Arabic-Indic numeral path on clubs counts (:166, :450) | **CONFIRMED** — BlockedCard.tsx:13 convention mandates lib/format.ts routing; bare `.length` interpolation violates it |
| B-2 | Reviewer B | IMPORTANT | No success toast on favorite toggle | **REFUTED** — silent optimistic flip IS the design (hook: optimistic patch + rollback + pending-disable + error toast); a success toast would be noise |
| A-m1 | Reviewer A | MINOR | locale from pathname.split instead of useLocale | Noted; house pattern on several pages, not this run |
| A-m2 | Reviewer A | MINOR | ?tab=favorites one-shot read won't re-trigger on soft nav | Documented-by-design (comment :40-43); pills are runtime control |
| A-m3 | Reviewer A | MINOR | ORDER BY v.name no collation | Cosmetic; boarded note only |
| B-5 | Reviewer B | MINOR | No realtime sync on clubs page | Acceptable; noted |

## Standing bug-class sweep (parent)
console.* in API: clean (string literals only) · ::uuid casts: zero · eq(col,null):
clean · z-index: clean · i18n parity: exact (clubs 49/49, profile 111/111, errors
34/34) · hydration: useOnlineStatus hook used everywhere (no navigator.onLine).

## Full-stack connectivity (favorites chain)
DB venue_favorites → API list/ids/add/remove → hook dual-cache sync → clubs hearts
+ profile deep-link: all verified live by run #111 E2E + Reviewer B re-verification
this run (918 tests green, 8940913 on origin/staging).

## Phase 1.6 Sentry triage
Zero new signatures. venue_favorites cluster (1M/1H/1K/1J) last fired 2026-10-07
02:04Z (run #109 probe window, attributed); CORS probes (B, 124, Oct 3);
EADDRINUSE one-off (1G, Oct 3). koralink-web newest = viewport-diagnostic (Oct 5).
Nothing to fix or board.

## Admin state check (P2-164 prerequisite)
`git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin`
→ CLEAN. `git log --8 -- apps/admin`: CSV/export arc landed through PR #91; nothing
in-flight. koralink-admin.service active. Dashboard routes match board assumptions.
→ NO ADMIN HOLD. P2-164 eligible.

## Verdict
Proceed to build: (1) P2-164 UuidParamPipe sweep via zeroshot lane (hardening,
mechanical); (2) favorites polish (user-visible: formatMoney + Arabic-Indic
counts) parent-built in parallel. A3 boarded as new P2 row, not built.
