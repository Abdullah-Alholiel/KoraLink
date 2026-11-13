# Run #204 — Program Design (Gates 1–3 compact)

## Item A (parent-built): residual numerals + enum localization + hardening (P2-358 umbrella)

**Problem.** AR users still see Latin digits / English enum words on the match
detail page — the highest-traffic screen — despite three numerals sweeps
(P2-257b run #193, P2-342 run #202, P2-353/354/356 run #203).

**User story.** As an Arabic-first player, every number and label on the match
page reads in Arabic-Indic digits and localized words.

**Scope.** IN: match detail page render fixes (openSpots chip, comments count,
intensity header + sheet title, surface pill + rules line), shareParams currency,
formatMoney non-finite guard, kick-path eviction concat (API 1-line).
OUT: queuedOf/queuedPrefix ICU keys (position/count markers ARE locale-formatted
by next-intl inside ICU args — the raw-digit leak is ONLY the bare-JSX sites),
backend shapes, other pages.

**Contract checks (Gate 3, explicit):**
- [x] No endpoint/DTO/schema change — render + 1 hook-level guard only.
- [x] formatMoney signature unchanged (adds a guard; all existing callers keep
      behavior; '' return only on non-finite input which previously rendered
      the invalid string "NaN").
- [x] i18n: ZERO new keys (reuses host.matchTypeCasual/Competitive,
      clubs.surfaceGrass/Artificial — both already EN+AR present, pinned by
      P2-342 work).
- [x] Adapter untouched — detail page already carries intensity/surface/currency.
- [x] API kick-path: `concat` is behavior-identical for today's single promote
      call per path (12/12 waitlist-money + money-notify specs green).

**Files:** apps/player-pwa/src/app/[locale]/match/[id]/page.tsx (7 render sites
+ 2 label consts), src/lib/format.ts (guard), test/components/p2353-*.test.tsx
(+2 pins), apps/api/src/modules/matches/matches.service.ts (concat + comment).

## Item B (lane-built, zeroshot 01a1d28e): P2-352 bell sheet Load-more

**Problem.** Bell sheet caps at 20 rows; `hasMore` returned but never consumed;
older notifications unreachable while badge shows the full unread total.

**Contract.** API already paginated (page/perPage 1..100 clamp, {items,total,
hasMore}) — NO backend change. PWA: useNotificationsFeed → useInfiniteQuery
(pages flatten in the ONE consumer NotificationSheet.tsx), Load-more row gated
on hasMore, loading/disabled/error-retry states, 3 new i18n keys EN+AR parity
(surgical ns-scoped insert), vitest coverage incl. URL-routed fetch mocks.
Parent reconciles: re-applies diff, runs REAL gates on the real-install tree.

**Success criteria:** build+vitest green on real tree; AR copy natural;
no regression to the 45s poll policy; flattened unread-fallback logic intact.
