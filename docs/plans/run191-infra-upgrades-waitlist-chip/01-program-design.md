# Run #191 — Gates 1–3 Compact (two items)

## Item 1 — Dependency security upgrade (non-major slice)

**Problem:** prod dependency trees carry CRITICAL advisories with non-major fixes while the CI
audit gate is report-only (`|| true`, security.yml:37). Known since run #183 (P2-300).

**User story:** as the owner I want the shipped dependency trees free of known CRITICAL RCE/
bypass advisories so prod exposure and audit noise drop without a risky major-bump cycle.

**Scope IN:** manifest + lockfile bumps that are semver-compatible (no API-breaking major):
- `next` 15.5.21 → **15.5.29** (apps/player-pwa, apps/admin — kills CRITICAL RCE/cache-poisoning cluster + fixes postcss/sharp HIGHs via bump)
- `@sentry/nextjs` → **10.78.0** (root exact pin 10.70.0→10.78.0; pwa/admin ^10.70.0 ranges pick it up via reinstall — kills CRITICAL middleware-bypass GHSA-mchm-gjx6-7h55)
- `socket.io-client` pwa manifest ^4.7.5 → **^4.8.3** (aligns admin; dedupe-only)
- transitive `npm audit fix --omit=dev` per app (dompurify, proxy-addr, shell-quote, engine.io, brace-expansion, picomatch, js-yaml, lodash, source-map-js, compression, follow-redirects — all fix=True non-major)
**Scope OUT (boarded, NOT this run):** @nestjs/* v12 line (@nestjs/bull 12, cache-manager 12,
config 12.1.1, platform-express 12.4.0 — carries multer/body-parser/js-yaml/lodash fixes),
drizzle-orm 0.45.x (SQL-injection HIGH; **known VPS trap**: drizzle-kit generate is DEAD here,
hand-written migration doctrine unaffected — orm bump is runtime-only but needs its own focused
cycle per run-#183 note "0.45.2 deferred to a focused half-day"), zod 4.6.7 + @t3-oss/env-* 0.13
(pwa majors), serialize-javascript (workbox — fixAvailable:false), sketches/_render stray
lockfile (untracked scratch — hands off).

**Files:** root package.json + package-lock.json; apps/{api,player-pwa,admin}/package.json +
package-lock.json. NO src changes. Branch `lane/run191-dep-updates` in a temp worktree
(shared tree stays on staging for the lane + docs).

**Acceptance:** per-app `npm audit --omit=dev` shows **0 critical** (pwa/api/admin) and high
count drops to major-fix-only survivors; `npx tsc --noEmit` ×3 clean; pwa `npx vitest run` all
green (grep `Test Files`); `npx turbo run build --concurrency=1` 3/3; PR green incl. semgrep +
pr-agent triaged.

**Risk & mitigation:** next patch-bump build breakage → gates catch, revert = single commit;
lockfile churn large but mechanical; services keep running on the OLD node_modules until the
merge+deploy (deploy-staging.sh post-merge next run re-installs on the VPS tree — recorded in
next-run recommendation).

## Item 2 — P2-312: glanceable waitlist position on my-games (+feed data)

**Problem:** a queued player sees "you're #N" only inside match detail
(matches.service findOne → `your_waitlist_position`, api-adapter:430). Feed/my-games cards show
only the raw count ("N on waitlist") — no personal position. Re-scoped per Reviewer B #191.

**User story:** as a queued player I want to see "You're #3 in line" on my Games card so I know
when a spot is likely to open without opening every match.

**Contract (Gate 3):**
1. `GET /users/me/matches` (users.service.ts:230) SQL adds two columns:
   - `waitlist_count` = `(SELECT COUNT(*)::int FROM match_waitlist w WHERE w.match_id = m.id)`
   - `your_waitlist_position` = `(SELECT w.position::int FROM match_waitlist w WHERE w.match_id = m.id AND w.user_id = ${userId}::text LIMIT 1)`
   (subqueries, GROUP BY untouched — matches findNearby's scalar-subquery style; id params cast
   `::text` per house rule; TS return type extended `waitlist_count: number; your_waitlist_position: number | null`)
2. `GET /matches` (findNearby) adds `your_waitlist_position` scalar subquery with
   `${currentUserId ?? null}::text` (NULL when anonymous — matches the existing is_joined pattern;
   NULl → adapter stays null). TS row type + return contract extended.
3. `apps/player-pwa/src/lib/api-adapter.ts`: `MatchListItemApi`/NearbyMatchApi shape gains
   `your_waitlist_position?: number | null`; `adaptMatchList` maps
   `yourWaitlistPosition: m.your_waitlist_position ?? null` (feed) — detail mapping already exists (:430).
4. `apps/player-pwa/src/types/index.ts`: `Match.yourWaitlistPosition?: number | null`.
5. `MatchCard.tsx`: when `yourWaitlistPosition != null`, render a small amber chip
   "You're #N in line" NEXT TO the existing fullWaitlist line (no z-index, inline flex, text-xs;
   RTL-safe — plain text flips naturally; Arabic-Indic numerals come from the i18n layer's
   count interpolation as with fullWaitlist). Host/joined states unaffected.
6. my-games/page.tsx renders MatchCard (already generic) — gains the chip via the adapter field.
   Feed MatchCards get it the same way.
7. i18n (EN+AR, exact keys, leaf parity 1187→1188): `matchCard.youQueued` =
   EN `"You're #{{count}} in line"` / AR `"أنت في المركز {{count}} في قائمة الانتظار"`.
   (Zero new API surface; both endpoints extended, not added.)

**Contract verification checklist:**
- [x] No mutation endpoint touched (reads only — mutation contract N/A)
- [x] Frontend types accept the exact JSON (optional fields, null-safe)
- [x] Adapter maps every new API field (feed + my-matches paths)
- [x] No field silently undefined (adapter `?? null` default matches api-adapter.ts:84 convention)
- [x] i18n keys exist EN+AR (1 key ×2 locales)

**Acceptance:** new vitest spec covering adapter mapping (position present/null) + MatchCard
chip render/absence; existing suites green; tsc 0; turbo 3/3.

## Status

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | [00-retro.md](./00-retro.md) |
| 1–3 | Program design | ✅ DONE (this doc) | 01-program-design.md |
| 4 | Vertical slices | IN PROGRESS | lane/run191-dep-updates + lane/run191-p2-312 |
