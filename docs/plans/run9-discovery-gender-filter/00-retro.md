# Run #9 — Discovery Gender-Filter Fix (P1-2 partial)

## Gate 0 — Retrospective

**Baseline:** `1bccdb0` (run #8 follow-up boot-hardening by parent session). Last 20 commits:
fix-heavy streak (dispute idempotency, DM idempotency, WS moderation, POTM realtime, boot
crash-proofing) after an earlier feat wave. fix:feat ratio elevated but justified — run #4-#9
closed a race/security cluster found by review cycles; recent runs each closed one race class
completely (index + onConflictDoNothing + tests) rather than patching symptoms. No regression
loop detected: no item fixed twice.

**Tech debt audited (this cycle's touch area — matches module):**
- `matches.service.ts:1752` castVote bare return (P2-5, known) — untouched this cycle.
- GetMatchesDto lacks `limit` → external `?limit=5` 400s (Sentry KORALINK-API-E, 3 events/24h,
  culprit GET /api/v1/matches, ValidationPipe.exceptionFactory). Backlog-noted.
- FilterBar.tsx:20-25 comment claims API uses `men|women|mixed` — FALSE (DB enum `Men Only`
  etc., schema.ts:60-64). The comment documents the bug.

**Full-stack connectivity audit (the reported class: "filters don't work"):**
- Store → Page: play/page.tsx wires FilterBar → setFilters → useMatches(filters) ✓
- Hook → API: useMatches maps `filters.gender` → `params.gender` verbatim ✓ (mapping neither
  here nor in fetcher)
- Page → API contract: **BROKEN** — FilterBar values `men|women|mixed` fail DTO
  `@IsIn(['Men Only','Women Only','Mixed'])` → 400 on every gender chip tap.
- DB → API: `gender_rule` is pgEnum GenderRule ('Men Only','Women Only','Mixed'); genderClause
  (`matches.service.ts:369-371`) compares `m.gender_rule = ${gender}` — works once the value
  arrives valid.

**Classification:** IMPORTANT (broken user flow, silent — user taps a chip, feed 400s, PWA
shows empty/error state). Affects Play feed discovery + any venue-scoped gender use.
**Proceed to Gate 1:** YES.

## Gates 1-3 — Compact

**Problem:** Tapping any gender filter (Men/Women/Mixed) on the Play feed sends
`?gender=men|women|mixed`; the API DTO rejects it (`forbidNonWhitelisted` + `@IsIn` mismatch)
→ HTTP 400 → feed breaks instead of filtering. Female-user discovery (Saudi market: Women
Only games) is functionally unreachable via UI.

**User story:** As a player, when I tap the "Women" filter chip, I see only Women-Only matches
instead of an error/empty state. (P0 of story: filter must not break the feed.)

**Scope:**
- IN: API accepts lowercase tokens `men|women|mixed` (PWA contract, FilterBar.tsx:21-25) AND
  the DB-enum strings for backward compat; server maps token → GenderRule enum at the query
  boundary; jest tests pin the contract (incl. women-before-men ordering pitfall from
  koralink-review-workflow); `limit` param (1-50) added to GetMatchesDto to close the
  KORALINK-API-E 400 class; PWA unaffected (already sends the right tokens).
- OUT: `skill_level` discovery filter (matches.skill_level column doesn't exist — needs
  product decision on semantics: host-skill vs match-declared level; boarded as P1-2
  remainder). Radius hard-cutoff (deliberately descoped, product decision US2,
  matches.service.ts:353-355 comment). No UI changes.

**Architecture delta:** GetMatchesDto widens `gender` validation to the token union +
normalizes via a `normalizeGenderRule()` helper (shared by DTO transform); `limit` field
added (`@Min(1) @Max(50) @Type(() => Number)`); findNearby maps before the SQL clause. No
schema/migration changes. No new endpoints.

**Contract (Gate 3):**
- `GET /api/v1/matches?gender=men|women|mixed|Men Only|Women Only|Mixed` → 200, same
  `NearbyMatchApi[]`-shaped response as before. Any other gender value → 400 (unchanged).
- `GET /api/v1/matches?limit=1..50` → 200, LIMIT applied (default 50 unchanged, `limit` caps
  page size). `limit=51+` / `limit=abc` → 400.
- TS: `GetMatchesDto.gender?: 'men' | 'women' | 'mixed' | 'Men Only' | 'Women Only' | 'Mixed'`;
  `GetMatchesDto.limit?: number`; `findNearby(dto: GetMatchesDto, currentUserId?: string)` —
  signature unchanged (gender normalized internally).
- i18n: none (no user-facing strings changed).

**Gate 3 contract checklist:**
- [x] No mutation endpoints touched (read-only query contract) — mutation-return rule N/A.
- [x] Frontend types accept the exact JSON: NearbyMatchApi unchanged; PWA already sends
      `men|women|mixed` (FilterBar.tsx:22-24) — now accepted verbatim.
- [x] Adapter: `adaptMatchList` unchanged — response shape unchanged.
- [x] No field silently undefined: gender/limit are optional query params with explicit 400
      on invalid; SQL clause only added when value present (existing pattern).
- [x] i18n keys: none needed (no UI text change).

## Gate 4 — Slices
1. Slice 1 (tracer): DTO accepts + normalizes gender token → findNearby filters correctly →
   jest proves mapping (incl. 'women' precedence) → build green → commit.
2. Slice 2: `limit` param (DTO + pass-through to SQL LIMIT) + jest → build green → commit.
3. Post: full gates (tsc, root build, jest, vitest) → API service restart AFTER build →
   live probe `?gender=men` → 200.
