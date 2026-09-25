# Run #74 — Gate 0 Retro (P2-100 reminder ladder)

**Date:** 2026-09-25 · **Lane:** Admin rotation (74%4=2) · **Build item:** P2-100 (API matches — outside admin hold)

## Audit of the touched area

- `matches.scheduler.ts` — 4 @Cron jobs, all try/catch-wrapped. `match-start-reminders` (*/15) calls
  `sendMatchStartReminders()` (matches.service.ts:496): single [15m,45m) window, single
  `match_starting_soon` key, stamp-once via `reminders_sent_at`. No T-24h leg (board P2-100).
- Schema: `reminders_sent_at` (schema.ts:452) is the only reminder stamp.
- Push text: `push-text.ts` CATALOG (server-rendered, en/ar; PWA i18n parity untouched).
- Mail: `match_reminder` template in mailer.copy.ts (direct call site, :42/:76).
- Worker route chain (worker/index.js) routes `match_starting_soon` → match deep link; any NEW push
  type must be added there AND in test/structure/push-notification-click.test.ts type list.
- Migrations: 45 journal entries; newest tag 0043 (hand-written VPS convention, drizzle-kit broken
  here); live newest when = 1789846359444 (2026-09-19). Applier = scripts/migrate-vps.mjs
  (sha256-keyed, atomic per file, gap guard exit 5).
- Tech debt in area: none found by Reviewer A's standing sweep (all 12 bug classes clean).

## Reviewer findings triaged this run (admin lane)

| Finding | Verdict | Action |
|---|---|---|
| users pages `Date.now()` hydration (A-IMPORTANT) | **REFUTED** — `useLiveAdminData` fetches in useEffect; data=null at SSR → `userStatus`/`purgeInfo` never run server-side. Same shape as run #73 banner refutation. No SSR surface. | none |
| deletePitch count-then-DELETE TOCTOU (A-IMPORTANT) | **CONFIRMED** — matches.pitch_id (schema.ts:420) is a bare varchar(36), NO DB FK; concurrent booking between count and delete orphans the reference. Partner module = admin API surface → **ADMIN HOLD** (projects-dir dirty). | boarded P2, BLOCKED (hold) |
| settings labels hardcoded English (B-P1) | **CONFIRMED** by parent read (settings/page.tsx:17-22 KNOWN_SETTINGS literal labels). Admin surface → hold. | boarded P2, BLOCKED (hold) |
| rbac.ts `can()` flags unused on dispute/settings pages (B-P1) | plausible (B grep: zero can() hits); admin surface → hold; re-verify when hold lifts. | boarded P2, BLOCKED (hold) |
| HQ users bulk moderation missing (B-P1) | real ops gap, admin surface → hold. | boarded P2, BLOCKED (hold) |
| B-P2 residuals (skeletons, audit CSV, enum fallback, earnings drill-down) | polish; backlog lines. | backlog |

## Decisions this run

- **ADMIN HOLD continues** (projects-dir lane carries Abdullah's uncommitted merge-conflict state:
  Dockerfile/package.json/package-lock/users/page.tsx dirty). NO admin-surface code touched; the 4
  admin findings are boarded BLOCKED, not built.
- Reviewer-A hydration claim refuted on the same evidence pattern run #73 used (client-only data
  fetch) — recorded to prevent a future run re-litigating it.
- P2-100 chosen over admin items: buildable end-to-end within budget, zero owner deps, zero admin
  surface. Security/data-integrity > broken flow > missing functionality ranking keeps the two
  CONFIRMED admin defects on the board at P2-BLOCKED rather than silently dropped.

## Baseline gates (pre-slice, final tree 2071901)

turbo `--concurrency=1` 3/3 · vitest 99f/721t · PWA tsc 0 · lint 0 · API jest 635/635 — ALL GREEN.
