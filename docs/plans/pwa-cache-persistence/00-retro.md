# Cycle: PWA Persisted Query Cache (offline-first cold start) — Gate 0 Retro

**Date:** 2026-09-03 · **Baseline:** run #29 (8ef3106 + a17755a) · Trigger: Abdullah asks
"how can I have a better data load on PWA — cached DB or local DB that stores and fetches
when online, always shown the fastest way?"

## Current state audit (evidence)

| Layer | What exists today | File:line evidence |
|---|---|---|
| In-memory query cache | TanStack Query v5.102.8, staleTime 60s default, refetchOnWindowFocus false | `src/providers/QueryProvider.tsx:6-18` |
| Per-query freshness | venues 5min, settings 10min, chat 15-30s, feed default | `src/hooks/useVenues.ts:76`, `useDisputes.ts:59`, `useConversations.ts:121,145` |
| SW runtime cache | matches NetworkFirst 3s/60s, clubs+venues SWR 24h, wallet/auth/payments NetworkOnly, static 30d | `next.config.mjs` workboxOptions.runtimeCaching |
| Persistence | **NONE for query data.** localStorage holds only token + Zustand user; zero IndexedDB in app code | grep `indexedDB|idb` → 0 app hits |
| Cold open cost | Full network refetch of every screen after kill+reopen — the slow load being asked about | derived from above |

## Findings (CRITICAL/IMPORTANT/MINOR)

1. **IMPORTANT — no persisted query cache**: kill+reopen = blank shell + full network refetch.
   Service-worker caches only help offline/timeout (NetworkFirst waits for network when online).
2. **MINOR — logout funnel is clean**: all paths (`SignOutConfirmSheet` onConfirm → `logout()`,
   `fetcher.ts:116` 401 self-heal → `logout()`, `AuthBootstrap.tsx:82` probe-fail → `logout()`)
   already converge on the Zustand `logout()` in `store/slices.ts:28` — one hook point for cache wipe.
3. **MINOR — query keys are well-namespaced** (grepped inventory, 33 unique keys) → exclusion
   matrix by first key segment is reliable (`wallet*`, `auth`, `notifications`, `match*`, `user*`,
   `conversation*`, `dispute`, `pom`, `reports`, `feed`, `users` are private/scoped; `matches`,
   `venue(s)`, `pitch-slots`, `settings` are public discovery data).
4. **MINOR — board healthy**: P0/P1 money+email items parked by owner decisions; no admin dirty
   tree (this cycle doesn't touch admin anyway).

## Tech debt / fix:feat ratio

Recent cycles (runs #26-#29) are feature+security work with review-fix commits bundled; no
reactive fix loop. No new debt introduced by this cycle's area (no prior persistence code).

## Decision

Build **Level 3 (persisted query cache)** this cycle — smallest change with the largest cold-start
win. **Level 4 (local DB + offline mutation queue)** is recorded as P2-46 on the kanban for a
later cycle (Abdullah's explicit request).

**PROCEED to Gate 1-3** (autonomous mode — Abdullah approved the exact plan proposed in chat,
including the exclusion list and logout wipe).
