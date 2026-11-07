# Run #93 — API-modules lane (93%4=1) — Gate 0 Retrospective

**Date:** 2026-10-01T15:18Z · **Rotation:** API modules + security lens · **Reviewers:** A+B clean on zai glm-5.3-flash (159s combined, 30th consecutive clean zai run).

## ADMIN STATE CHECK (item touched partner API surface)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → **0 dirty** (no owner in-flight work).
- `git log --oneline -8 -- apps/api/src/modules/partner` → last touch `5f721f8` (P2-12 run #85). `koralink-admin.service` active. All 13 dashboard routes present.
- No admin-area board item was picked; the API hardening below touches `apps/api/src/modules/admin/pitches.*` only (no `apps/admin` UI files).

## Board-item premise audit (before picking)
- **P2-108 (dead Admin bypass in partner.service) — PREMISE REFUTED.** The row claimed every `actorRole` Admin branch is unreachable ("controller is @Roles('VenueOwner'), admin access removed by design 2026-08-31"). Reality: `apps/api/src/modules/admin/pitches.service.ts:152-158` documents and executes the delegation — `listSlots('', 'Admin', …)`, `generateSlots(adminId, 'Admin', …)`, `createSlot(adminId, 'Admin', …)`, `deleteSlot(slotId, 'Admin', …)` — so the Admin bypass IS the live, audited mechanism for HQ pitch/slot management. Deleting it (the row's suggested fix) would break the admin console. Row → REFUTED, no rebuild.
- **P2-88 remaining rebuild (drizzle snapshot chain)** — needs `drizzle-kit` install (fails on this VPS per run-#71/#87 findings); dedicated half-cycle on another machine. SKIP (reason recorded).
- **P2-135 half-claim found in verification (parent + Reviewer B):** PR #58 shipped the poll on `useFeed`'s `useFeed` + `useNotifications` hooks, but the bell-sheet hook `useNotificationsFeed.ts` (same `/users/me/notifications` endpoint, same `['notifications']` key) has NO poll — the board row's "useFeed AND useNotifications wire listRefetchInterval" is misleading if read as `useNotificationsFeed.ts`. → complete the slice this run.

## Reviewer findings triage (A: 0 CRITICAL / 2 IMPORTANT; B: claims + gaps)
| Finding | Triage |
|---|---|
| A: wallet DEBIT (wallet.service.ts recordTransaction) deviates from FOR UPDATE-first house pattern | **Downgraded to backlog note.** The balance update is a single atomic SQL increment (`wallet_balance + delta`) whose post-update value is checked < 0 INSIDE the tx; PG row locks serialize concurrent writers on the row, so the overdraft invariant holds. Reviewer A's own text concedes "not exploitable as written". Consistency debt, not a bug. |
| A: `admin/pitches.service.ts:158` passes `''` as ownerId sentinel to partner.listSlots | **BUILD this run** (XS): forward the real adminId; the sentinel only works while the Admin branch makes ownerId moot — a future non-Admin call with `''` would query `owner_id = ''`. |
| A: partner Admin-bypass audit semantics consistent; query-schedule policy clean; all standing sweeps clean | No action. |
| B: P2-132/P2-129/P2-130 claims VERIFIED (file:line); P2-135 PARTIAL (bell-sheet hook) | **BUILD this run** (completion). |
| B product-gap leads: push granularity P1 → **REFUTED** (P0-5 DONE run #28, 4-category prefs live); match share P1 → **REFUTED** (`shareOrCopy` wired `match/[id]/page.tsx:36,209-213`); wallet receipts P1 → deduped into P1-27 (withdraw) + P0-2 (payments) scope; prayer-time slot hints → backlog note (P2-class, differentiator not gap); venue photo gallery → needs evidence pass before boarding (B itself said "verify before boarding") — recorded as backlog line. |
| B design lens: play/wallet/home offline+error states, aria labels, RTL, i18n 1008/1008 parity, locale-aware money/dates — all pass. |

## Sentry / journal triage
No new signatures: API newest = pre-Neon-cutover cluster (Sep 25, CORS probes n=115 + quota-era 1C/1D/1E/1F); web frozen Sep 14. journalctl 0 error lines ×3 services (5h). 3/3 services active, /health 200.

## Strix monthly pass
Already done this window — run #91 (Oct 1 01:55Z, `koralink-src_2000`, 0 findings). Skipped per one-per-month rule.
