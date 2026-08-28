# Gate 0 — Retrospective: AuthBootstrap stale-user (P2-17 / t_cc69d8d4)

**Cycle:** run #10, 2026-08-28T18:xxZ · **Area:** PWA auth bootstrap (`apps/player-pwa`)
**Rotation emphasis:** Admin (run#%4=2) — Admin self-review done in parallel; see run report.

## Recent commits in the touch area

- `1bccdb0` fix(api): crash-proof boot, alias /health — API-side hardening, not PWA auth.
- `b9ef749` fix(api,admin): deleteSlot TOCTOU + admin 403 handling — admin console got
  401-only logout; **the PWA equivalent gap is this cycle's subject** (parity finding).
- `306c74c` fix(api): discovery gender filter — live-verified this run (E2E probe).

## State audit (what exists today)

- `apps/player-pwa/src/components/auth/AuthBootstrap.tsx` — populates Zustand on cold load
  when `user` is null. `enabled: isHydrated && !user` → **skips the probe entirely when a
  persisted user exists** (`!user` clause).
- `apps/player-pwa/src/lib/fetcher.ts` — throws `FetchError(status)`; **no 401 handling**:
  nothing clears `koralink_token` or logs the store out on 401 (grep: only `profile/page.tsx`
  logout button calls `clearAuthToken`).
- Store: `useAppStore` persists `user` (zustand/persist) → survives reloads; JWT expires
  (7d) or account gets banned → every data query 401s forever.

## Failure cascade (evidence-cited)

Persisted user + expired/banned auth → AuthBootstrap never probes (enabled=false) →
`useWallet/useMatches/...` all fire with stale Bearer → 401 FetchError → pages render error
states ("5 UX states" error branch) with no self-heal → user must find the profile logout
button manually. Highest-impact on iOS PWA where sessions persist for weeks.

## Tech debt noted (not this cycle)

- `useWalletHistory` has no pagination at all (t_856d0db3 — boarded P2, separate slice).
- Mirror board has 4 stale "fixed-in-code but never re-verified" cards (t_61e5ff50,
  t_09ccc370, t_0727919d, t_222e530a) — process debt; run report carries re-verification.

## Fix:feat ratio & verdict

Recent cycle commits are predominantly fixes (reactive), consistent with pre-launch hardening.
**Verdict: proceed to Gate 1** — small, self-contained, no schema/API changes.
