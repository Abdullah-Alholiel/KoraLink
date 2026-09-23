# Factory Run #59 — Gate 0 Retro & Cycle Docs (rotation: DB & Infra, 59%4=3)

**Date:** 2026-09-18 (~10:15Z cron fire) · **Branch:** `staging` @ `610508d` via dedicated worktree
`/home/ubuntu/worktrees/koralink-staging` (main shared clone is checked out on the sibling's live
feature branch `feat/search-neighborhood-suggestions` with uncommitted search-suggestions WIP —
untouched, never staged, no branch switch).

## Gate 0 — Retrospective (area audit before build)

**Where we are:** staging healthy (services api/pwa/admin all active, /health 200, zero journal
`-p err` entries in 5h; Sentry 24h = zero new signatures). Run #58's in-review claim verified
this run before build (recipe in STATE.json): jest wallet 17/17 incl. the removal pin; grep
evidence `wallet/pay` only in REMOVED-comments + pin; live probes `/wallet/pay` → **404**,
`/wallet/topup` → **401** (removal + guard live-probed from this run's shell). Reviewers (A+B,
zai glm-5.3-flash, 325s + 359s — 9th consecutive clean zai run) verified P1-48/P1-50 TRUE with
file:line evidence.

**Rotation lane (DB & Infra) audit — the migration pipeline:**
- `scripts/migrate-vps.mjs` (deploy-staging.sh:67 calls it) is the sole applier on this VPS
  (drizzle-kit unavailable). Its `DUP_CODES` tolerance includes **`23505` (unique_violation)** —
  a DATA error class. A genuine constraint violation during a future data-touching migration
  statement would be logged as "tolerated (already exists)", the file hash-journaled as APPLIED,
  and the migration silently half-applies. No committed migration carries a real data INSERT
  (0034/0026 "insert" hits are trigger/comment prose), so the clause protects nothing today —
  pure latent hazard introduced in `2c88dd5` (deploy pipeline slice 1).
- Swagger UI is mounted unconditionally (`apps/api/src/main.ts:141`) — full API surface + cookie
  auth docs exposed on any origin that can reach the API. Boarded P2-79 (needs owner call: gated
  off vs. credential-protected).
- `_journal.json` idx 39/40 reuse the `0014_*` numeric prefix (taken by `0014_mean_franklin_storm`)
  — verified real (`0014_mean_franklin_storm` + `0014_admin_notification_verbs` both journaled).
  Any fresh-env tooling reconciling by 4-digit index (the `fileIndex()` gap logic reads files, not
  journal tags) mis-orders them; migrate-vps.mjs itself is hash-journaled so unaffected. Boarded
  P2-80 (needs owner/Abdullah session decision: hand-edit 39/40 tags vs leave+document).
- CSP `script-src 'unsafe-inline' 'unsafe-eval'` (next.config.mjs:216-218) — standing reviewer
  item, already boarded as P2-42 (dedupe, no new row).
- drizzle-orm currently `^0.44.1` (lockfile 0.44.7). **v1.0 is now released** (drizzle-team
  "v0 → v1 updates" page + v1.0 beta ecosystem coverage in Sep 2026 comparisons) — the queued
  "0.45.2 half-day" is superseded: boarding P2-81 (v1 upgrade cycle).
- v1 has **no `--custom` flag** — `drizzle-kit generate --custom` (deprecation-only in 0.x) is
  REMOVED in 1.0. Run #55's 0042 was generated via `drizzle-kit generate --custom` (per report).
  P2-81's plan must include the hand-written + journal-append flow (0030+ convention) as the
  v1 replacement — which this repo already uses for 0030+ anyway.

## Reviewer findings triage (merged, evidence-verified by parent)

| Finding | Source | Verification | Action |
|---|---|---|---|
| migrate-vps.mjs:42 `DUP_CODES` includes 23505 → silent half-apply risk | A CRITICAL | Confirmed line 42, try/catch :101-106. No data-INSERT migrations exist; hazard is latent. `git log -S 23505` → `2c88dd5` (re-run tolerance intent). | **BUILD (P2-78)** |
| Swagger mounted unconditionally (main.ts:141) | A IMPORTANT | Confirmed. | Board **P2-79** (owner call) |
| journal idx 39/40 reuse `0014_*` prefix | A IMPORTANT | Confirmed via grep. | Board **P2-80** (needs owner session) |
| CSP unsafe-inline/eval (next.config.mjs:216-218) | A IMPORTANT | Known standing item. | Dedupe → existing P2-42 |
| 0042 FK indexes non-CONCURRENTLY | A MINOR | Noted for future large-table ops; no action at current scale. | Note in P2-78 docs |
| worker fetch no timeout | A MINOR | Edge polish. | Backlog note (BOARD backlog section) |
| drizzle-orm caret range | A MINOR | Caret is fine; the real item is the v1 upgrade. | Board **P2-81** |
| seed.ts console.* | A MINOR | CLI tool — acceptable. | none |
| systemd units not in repo | A MINOR | Host-only config, documented convention. | none |
| "No in-app notification history" P1 (B) | B P1 | **REFUTED** — `useNotificationsFeed.ts` fetches `/users/me/notifications` (items/total/hasMore + unread-count + mark-read); `feed_items` table schema.ts:905; NotificationSheet/NotificationBell consume it. B grepped the wrong module (push-subscription controller). | refuted, not boarded |
| Chat detail lacks offline/error UX states | B P1 | Confirmed `messages/[id]/page.tsx` (path is `[locale]/messages/[id]`, NOT `(main)`) has 0 OfflineBanner, uses `common.loading`/`common.errorDescription` text labels (:167,:173) vs the Skeleton pattern on clubs/wallet/my-games. | Board **P2-82** |
| Unsubscribe failure strands browser subscription | B P2 | Confirmed `usePushNotifications.ts:105-118` — DELETE failure → catch swallows → `subscription.unsubscribe()` never runs, state kept. Fragile DELETE-body is existing P2-76. | Append addendum to **P2-76** |
| P2-72 push-locale-scope question | B bonus | TRUE + adequate: worker/index.js:2 is explicitly prepended into the generated sw.js, so the ar-fallback ships in prod SW. | P2-72 → DONE ✅ |
| P2-69 keyboard focus parity | owner landed 80ba859 | Confirmed. | P2-69 → DONE ✅ (owner session) |

## Gates 1–3 (compact, per item)

### P2-78 — migrate-vps.mjs 23505 tolerance (Item 1)
- **Problem:** a unique-violation in any future data-touching migration statement is swallowed
  as a "duplicate" and the migration journals as applied — silent half-apply of a DML migration
  (money-adjacent rows possible later: e.g. a fee-sweep backfill).
- **User story:** as the operator, a migration that fails partway must STOP the deploy with a
  loud error, never silently half-apply.
- **Scope:** IN: narrow `DUP_CODES` to the 4 DDL-duplicate codes (42P07 dup_table, 42710
  dup_object, 42701 dup_column, 42P06 dup_schema) + keep the `/already exists/i` message guard
  for unusual duplicate-wordings; pin spec (4 codes tolerated, 23505 NOT, 42P07 IS, in-codes
  count = 4). OUT: any behavior change for DDL idempotent re-runs (unchanged), any migration
  file changes, no DB writes this run.
- **Architecture delta:** `scripts/m migrate-vps.mjs` only + new jest pin spec. No API/PWA code,
  no migration, no i18n.
- **Gate 3 contract checklist:**
  - [x] Behavior contract: DDL dupes (42P07/42710/42701/42P06) still tolerated verbatim
        (existing re-run behavior preserved — verified against script logic); data errors
        (23505 + all other codes) now fail loud with the existing FAILED log + exit 5.
  - [x] `/already exists/i` message fallback: kept verbatim (harmless broad net for odd
        dup-wordings; a unique-violation message never contains "already exists" — PG texts it
        "duplicate key value violates unique constraint").
  - line 42: `new Set(['42P07','42710','42701','42P06'])`; 23505 out.
  - [x] Pin spec asserts: 23505 ∉ set; each DDL code ∈ set; size === 4 (future additions must
        consciously edit this test).
  - [x] No i18n keys (zero user-facing strings); no observability wiring needed (script-level
        tooling; failure path already logs + exits 5).
  - [x] No DB migration this run (code-only).

### P2-75 — LanguageToggle required ariaLabel (Item 2)
- **Problem:** `ariaLabel = 'Language'` default ships untranslated English copy into Arabic UI
  whenever a future call site omits the prop.
- **User story:** as an Arabic-first user, no screen ever speaks English to me through an
  unlabeled control.
- **Required-ness contract (Gate 3):**
  - Prop becomes REQUIRED (no default) in LanguageToggleProps — TS enforces at compile time
    (the board row's stated fix).
  - No call-site edits needed (both sites pass t(...) — verified login/page.tsx:147,
    profile/page.tsx:411).
  - Pin tests: (1) type-level `@ts-expect-error` for the omission case — must compile the file
    under `tsc` including tests (PWA `npm run type-check` covers test/, CI-style); (2) render
    with aria-label="تحكم اللغة" → role=group has aria-label="تحكم اللغة"; (3) groups rendered
    WITHOUT the prop in tests compile-fail at type-check and throw a dev-time undefined guard.
    TS-only enforcement would be verified by type-check; the runtime guard covers test-env edge
    (jsdom renders may pass aria-label={undefined}).
  - No i18n keys (component receives its label via props from localized call sites; endonyms ع/EN
    are universal); no backend, no migration.
- **Risks:** none identified — purely tightening.

---

**ADMIN STATE CHECK (per Phase 3.5 step 0):** `git status --short apps/admin apps/api/src/modules/partner` in the SHARED clone → CLEAN (Abdullah's WIP landed as 80ba859 + 4a7af81). ADMIN HOLD **LIFTED** this run (recorded in run report). No admin-area item is being built (P2-69 already landed by the owner).
