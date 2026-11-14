# Run #94 — Gate 0 Retrospective (Admin lane, 94%4=2)

## Preflight state
- Branch `staging` @ `5777206` (run #93 report commit), clean tree, 0 behind / 0 ahead, gh auth OK.
- node_modules healthy (921 root entries — run-#92 calibration, no npm ci needed).
- z.ai probe 200 in 2.5s (weekly 1%, 5h 11%); delegation `glm-5.3-flash`/zai/coding base, reasoning_effort low.
- Services 3/3 active, API /health 200, 0 journal error lines (5h window) on all three services.
- **Strix monthly pass: NOT DUE** — `strix_scan=2026-10-01` already in STATE notes (run #91, `koralink-src_2000`, findings=0). One-per-month rule; quota guard moot.
- Sentry triage (24h): API 18 issues — all pre-cutover clusters (newest lastSeen 2026-09-25: CORS probes n=115, Neon-quota era 1C/1D/1E/1F, pre-Resend email 1B n=9 lastSeen 09-10). WEB newest 09-14 (frozen since the PWA web cutover). **No new signatures. Nothing to triage.**

## ADMIN STATE CHECK (step-0, mandatory for admin lane)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → **CLEAN** (no in-flight Abdullah edits).
- `git log --oneline -6 -- apps/admin` → recent landings are factory PRs (#55 P2-106 rbac can(), #51 P2-124 hydration, #50 P2-68 CSV, #44 P2-115, #38 P2-104). No owner work the items could go stale against.
- `koralink-admin.service` active. Dashboard routes live: audit, dashboard, disputes, matches, partner, pitches, reports, settings, settlements, transactions, users, venues.
- **Conclusion: admin-lane items are PICKABLE this run.** However, the two admin BOARD items (P2-107 bulk moderation, P2-134 occupancy calendar) both carry "needs owner call" gates — they stay owner-blocked (decisions queue), not admin-hold-blocked.

## Recent-cycle audit (PRs #55/#60/#61/#62)
- Reviewer B verified ALL run #93 claims on staging: PR #60 (`useNotificationsFeed.ts:5,26` 45s poll + 3-case test), PR #61 (`pitches.controller.ts:39-59` JWT adminId extraction; `pitches.service.ts:156-161` real-id forwarding; 3-case spec), PR #62 (`format.ts:54` formatMoney + clubs call site :325 + 4-case test), P2-108 refutation (delegation live at :161/:165/:179/:193). **All four VERIFIED — run #93 in_review_items promote to DONE.**
- Reviewer A (admin lane scope): 0 CRITICAL. Guard/RBAC/audit surfaces clean (12/12 admin controllers guarded; partner Roles enforced; TOCTOU closed on settlements/refunds/role changes; rbac.ts ↔ API boundary consistent; Drawer a11y clean; admin i18n 618/618).
- Two IMPORTANT findings → built this run (see 01-program-design.md): admin DTO validation-cap gaps + unvalidated from/to slot-window params (both routes).

## Tech-debt / standing classes swept
- No `::uuid` casts, no `eq(col,null)`, no `console.*` in API scope, i18n parity 618/618 (admin) + 1008/1008 (PWA).
- Reviewer-A wallet lock-order consistency note (run #93) stays backlog — no rebuild.
- MINOR observations (not boarded individually): admin match cancel pre-check outside tx (safe — delegate re-asserts under lock), venue-transfer check-then-write (last-write-wins, both audited). Recorded here as audit-trail notes.

## New board rows
- **P2-136 (API/Admin)**: admin mutation DTO caps missing (transfer-venue.newOwnerId, update-pitch-admin.venue_id, list-pitches.venueId, resolve-dispute decision/internalNote, list-venues search/city) — BUILT this run.
- **P2-137 (API)**: admin + partner slot-window `from`/`to` query params unvalidated (garbage dates → PG 500, reversed range → silent empty) — BUILT this run.
- **P2-138 (PWA, Reviewer B run #94)**: no route-level loading.tsx/error.tsx boundaries under (main)/ surfaces (play, wallet, messages, my-games, clubs) or match/[id] — a render error blanks the whole app to the root boundary. TODO (P1-class lead; needs its own sized cycle — recorded as board row, not built this run).
- P2 (minor, backlog line): clubs/[id] offline marker parity (same class as P2-130/P2-121 patterns).
