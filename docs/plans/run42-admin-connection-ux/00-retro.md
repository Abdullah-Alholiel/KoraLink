# Run #42 — Gate 0 Retrospective (admin connection-state UX)

## Context
- Rotation 42 % 4 = 2 → Admin console. ADMIN STATE CHECK: clean tree, service active, no HOLD.
- API service was serving STALE dist (started 15:57Z, run #41 build 19:25Z). Restarted this run
  01:24:45Z, health 200 — run #41's money-string + lock code is now live.
- Run #41 left kanban docs uncommitted → committed as cff4e71 (leftover-docs commit).

## Reviewer-merged findings this cycle (both zai glm-5.3-flash; 158s / 368s)
- Reviewer A: 0 CRITICAL / 1 IMPORTANT (admin offline UX state missing console-wide —
  use-live-data.ts has no navigator.onLine handling, lines 39–109) / 2 MINOR (rbac.ts:96
  typo-path section cast, harmless; DTO sortBy plain string vs @IsIn — service whitelist
  already enforces intent). Bug-class sweep CLEAN: 0 console.*, 0 ::uuid, 0 eq(col,null),
  all WS handlers guarded, all 12 admin controllers guarded, drawer right-0 both locales ✓.
- Reviewer B: **11/11 run-#41 claims VERIFIED** (incl. P2-49 overbook race CLOSED at
  joinMatch:1012-1022 `.for('update')`; consumers safe on string amounts via formatMoney).
  Design gaps: **P1 raw backend error text surfaces to admins** (api.ts:87 → e.message →
  rendered raw in every list page); **P1 a11y thin** (20 aria usages total, h-4 w-4 hit
  targets); P2 live/stale indicator not rendered; P2 drawer overlay `md:left-64` fragile.
- Parent: dashboard/page.tsx:66-68 `.toLocaleString()` (no locale) known minor, confirmed
  unfixed, contained to 3 lines.

## Tech-debt observations
- apps/admin has NO test runner (type-check only) — slice gates = build + tsc + eslint;
  admin test infra is its own future item, not smuggled into this slice.
- Error blocks are copy-pasted across 22 files with 4 divergent shapes → standardize now.

## Decision
One slice: **admin connection-state UX** — shared LoadError (triad copy + retry + detail),
global OfflineBanner, dashboard locale pin. Reviewer B's a11y P1 (aria/hit-targets) and
P2 live-indicator → boarded separately (P2-54), NOT crammed into this slice.
