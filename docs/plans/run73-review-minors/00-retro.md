# Run #73 — Review-driven minors batch · Gate 0 Retro (compact, autonomous mode)

**Date:** 2026-09-25T01:17Z · **Worktree:** /home/ubuntu/worktrees/koralink-staging (staging @ ddf8c4f)
**Rotation:** 73 % 4 = 1 → API lane · **Reviewers:** glm-5.3-flash ×2 parallel (deleg_29cf5cc4, 152s combined, zai weekly 1%)

## Area audit (what this cycle touches)

- **API lane** (DTO validation layer + admin surface): Reviewer A swept the standing bug classes —
  **all clean**: zero `::uuid` casts, zero `eq(col, null)`, zero `console.*` in API src, FOR UPDATE on
  money/roster paths present, whitelist+forbidNonWhitelisted on, i18n parity exact, sheet z-index conform.
  Remaining API findings were 2 bounded-surface items (see Program Design).
- **PWA CSP config** (P2-42 follow-through): run #72 cleaned prod script-src; Reviewer B found the SAME
  dead mapbox origins still alive in connect-src/style-src/img-src + prod `connect-src` allows cleartext `ws:`.
- **P1-52 (prod Neon quota)**: Sentry re-pull — 1C count 2→4, **lastSeen 2026-09-25T00:00Z**, plus two new
  signatures with the SAME root cause: KORALINK-API-1D (signup INSERT, 11:43Z) and KORALINK-API-1E (JWT
  session-validation SELECT, 18:40Z). Prod auth + signup are hard-down for real users. **Still owner-only
  (billing/plan fix). Board row updated with the new evidence.**

## Reviewer findings — verification outcomes (claims ≠ facts)

| Finding | Verdict | Evidence |
|---|---|---|
| RestoreAccountBanner renders `Date.now()` → hydration mismatch (Reviewer A IMPORTANT) | **REFUTED** | profile/page.tsx:142,145,231 — `purgeAt` initial state is `null` and is only set inside a client `useEffect` from localStorage; the banner mounts client-only, never in SSR HTML. No mismatch surface. No change. |
| venue-decision DTO `note` unbounded → audit-log bloat (Reviewer A IMPORTANT) | **CONFIRMED → FIXED** | venue-decision.dto.ts had `@IsString()` only; every sibling free-text DTO caps (1000/2000). Added `@MaxLength(1000)` + spec. |
| cast-vote `candidateId` unbounded `@IsString` (board run-#41 note) | **CONFIRMED → FIXED** | Added UUID-shape `@Matches` + `@MaxLength(36)` (varchar(36) house style — shape validation, NOT `@IsUUID` scheme check, per the run-#41 board note). Spec pins both. |
| pitchCostSar missing `@Max` (board run-#41 note) | **REFUTED (wontfix)** | Server-authoritative: the client value is documented as ignored (server derives pitch cost from hourly_rate × duration; any client value discarded). Unvalidated input has no surface. |
| mark-no-show `@IsUUID` vs varchar(36) drift (board run-#41 note) | **WONTFIX (documented)** | Reviewer A themselves scoped it "consistency nit only". Flipping to shape-validation now is a 30-day behavior change on a live endpoint with zero runtime impact (all ids ARE UUIDs today) — not worth the churn this run. Recorded here as the decision. |
| Dead mapbox origins in connect/style/img-src (Reviewer B) | **CONFIRMED → FIXED** | Zero mapbox/moyasar code/deps in PWA (run #72 grep + this run's re-grep). Dropped all four allowances. |
| Prod `connect-src ws:` cleartext (Reviewer B) | **CONFIRMED → FIXED** | `ws:` now dev-only spread; prod = `wss:` only (API origin is https everywhere deployed). |
| migrate-vps `$$` statement shredding (notepad build candidate) | **REFUTED — stale premise** | scripts/migrate-vps.mjs:121-124 executes statements via `tx.unsafe(stmt)` (postgres.js) — NO SQL parser in that path; the comment-stripper (105-109) is already `$$`-aware. Nothing to fix. Candidate dropped with evidence. |

## ADMIN STATE CHECK (mandatory — batch touches modules/admin/dto)

- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → clean (only
  MY venue-decision.dto.ts edit appears; no foreign edits).
- `git log -8 -- apps/admin modules/admin` → latest admin-surface commits are run #62's ban/suspend work
  (77dc1bf, 40f1cbe, c968ca8) — nothing newer in flight.
- `systemctl --user is-active koralink-admin.service` → active.
- **No HOLD. Batch proceeds.**

## Sentry triage (Phase 1.6 — API read-token, EU base)

- koralink-api 24h: 1C n=4 (Neon quota), 1E n=4 (18:40Z, jwt-cookie.strategy validate — quota), 1D n=1
  (11:43Z, signup insert — quota). All three = P1-52. CORS-evil.example (n=113, stale) = probe noise.
- koralink-web 24h: **zero new issues** — newest signatures end 2026-09-14.
- journalctl 5h: 0 error lines on api/pwa/admin. Services all active, API /health 200.
