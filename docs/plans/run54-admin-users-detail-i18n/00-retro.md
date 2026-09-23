# Gate 0 Retro — run #54 (admin rotation: users/[id] detail i18n)

**Baseline:** 14227c0 (run #53 report). Areas audited: apps/admin (rotation focus 54%4=2),
run #53 PWA/API commits.

## State check (ADMIN — mandatory this rotation)
- `git status` on apps/admin + partner/admin API surfaces: **clean** (no owner WIP).
- Service active; recent admin commits: 86723ea (P2-61 venues/[id] i18n), cc24d8a (filter
  aria-labels), cefb4a0 (a11y batch) — the shared-component standard (EmptyState/LoadError/
  PageHeader/StatusBadge) is broadly adopted; **one surface predates it: users/[id]**.

## Findings (Reviewer A minors A1–A3 + parent verification)
| # | Finding | Evidence | Class |
|---|---------|----------|-------|
| A1 | users/[id] detail page ships hardcoded English: `title="User"`, `Loading…` ×2, 12 dt row labels, back link, role-change note, Ban/Unban/Lift suspension/Suspend 7d | users/[id]/page.tsx:44-45,52,83-91,101,121,134,141,149,156 | CRITICAL-for-AR (same class P2-61 closed on venues/[id]) |
| A2 | Same page uses ad-hoc `<div>Loading…</div>` instead of the shared pattern (PageHeader + tc('loading')) used by venues/[id] | :44-45 vs venues/[id]/page.tsx:47-52 | MINOR (fixed with A1) |
| A3 | Sidebar mobile close `aria-label="Close menu"` hardcoded | Sidebar.tsx:102 | MINOR a11y |
| — | **Parent addition:** structure guard pins only 2 of 11 OfflineBanner surfaces (my-games wired :71, wallet plain-variant :321 — wallet is the intentional fallback variant, NOT pinned to `isOffline={!isOnline}`; pinning it would be wrong) | test/structure/offline-banner-coverage.test.ts:26-29 | MINOR (guard addendum) |

**Refuted/trimmed from reviewer leads:** Reviewer B's wallet-structure-test candidate — wallet's
banner is the deliberate `plain` fallback inside history; the correct addendum is my-games only.

## Bug-class sweep (Reviewer A): clean
`::uuid` 0 · `eq(col,null)` 0 · `console.*` 0 · FOR UPDATE on all match/wallet transitions ·
spots_filled host-counted · admin i18n parity 571/571 · admin z-scheme consistent.

## Sentry/journal triage (Phase 1.6)
API quiet since Sep 11 (API-B CORS noise stale, API-1B = boarded P1-41). WEB-D n=7 lastSeen
23:10Z Sep 14 = zombie-tab class (pre-promote), not a new survivor. Journal 5h zero errors,
all 3 services active, /health 200. **No new board items from errors.**

## Run-#53 in-review items: ALL 3 CONFIRMED (Reviewer B, independent)
95200e7 (incrementFail unconditional post-lockout; 2 specs asserted; 27 otp/auth tests green) ·
ed5b7f5 (report button received-only; key in both locales :1007; CS-9/CS-10 present) ·
a4adca6+1bdf0fc (structure test pins both surfaces + wiring regex; withVerifyLock + timingSafeEqual
in place). Promoted to DONE on the board. Note: vitest is 80f/550t (report said 82f — count drift
only, all green).

## Fix:feat ratio
Healthy — run #53: 2 fix / 2 feat; this run is remediation (P2-61 sequel) + guard hardening.

## Decision
Proceed Gate 1: build P2-67 (users/[id] i18n + a11y, ~20 literals, `userDetail` ns) + Sidebar
`closeMenu` key + structure-guard addendum (my-games). Small, finishable, zero owner dependency.
