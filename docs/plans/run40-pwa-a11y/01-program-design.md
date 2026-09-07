# Run #40 — Program Design (Gates 1–3 compact) + Status

## Problem (user story)

A player opens KoraLink on their phone. Three things break silently:
1. Around a POTM voting-deadline instant, the server-rendered card and the device's first
   render disagree about whether the "Vote POTM" CTA shows → React hydration error /
   flicker (Reviewer A CRITICAL).
2. The notification sheet's "Mark all read" optimistically zeroes the bell badge; if the
   request fails the badge stays wrong until the next refocus, and when unread items span
   more than one page the button can be hidden entirely.
3. Offline banner markup is copy-pasted on 7 pages with 3 drift variants; screen readers
   get no `role=status`, and pill toggles don't expose pressed state; no 44px hit-target
   token exists.

## Scope

IN: useNow hydration-safe clock; isPotmVotingOpen(now) contract; MatchCard + my-games
fixes; OfflineBanner component (7 pages); NotificationSheet unread/badge/error UX;
FilterBar aria-pressed + hit token; RescheduleSheet 7-day window; IDB versionchange;
null-actor guard; DatePicker midnight re-anchor.
OUT: generic `<AsyncStatus>` wrapper (residual, polish backlog); profile/clubs page-local
role=status consolidation; offline mutation queue (P2-7 parked); CSP migration (P2-42).

## Contracts

- `useNow(): number | null` — null during server render AND first client render; real
  `Date.now()` from the first effect. Consumers choose pre-mount posture (open vs elapsed).
- `isPotmVotingOpen(scheduledAt?, durationMins=60, now?: number | null): boolean` —
  `now === null` → optimistic open; omitted → live clock (tests/server).
- `OfflineBanner { isOffline: boolean; variant?: 'inline' | 'plain'; className?: string }` —
  renders null when online; role=status; inline = canonical mx-4 mt-2 amber strip;
  plain = caller-owned margins.
- i18n: `notifications.markAllFailed` (en/ar, parity-checked 886/886).
- Tailwind spacing token: `hit: '44px'` → `min-h-hit` / `min-w-hit`.

## Gate 3 verification checklist (shown explicitly)

- [x] No API contract changed — frontend-only cycle (0 endpoints touched).
- [x] Every new component has a typed props contract + jsdoc (OfflineBanner, useNow).
- [x] New i18n key exists in BOTH ar.json and en.json (verified by JSON parse + parity count).
- [x] No field silently undefined: unreadCount falls back items→filter when unread-count
      query has no data yet (pre-existing first-render behavior preserved).
- [x] Tests pin every new contract: 6 potm-window specs, 7 OfflineBanner/useNow/FilterBar specs,
      RescheduleSheet 7-chip pin, existing suites green.

## 00-status.md

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE | autonomous | [00-retro.md](./00-retro.md) |
| 1–3 | Program Design (compact) | ✅ DONE | autonomous | this file |
| 4 | Vertical slices | ✅ DONE | — | 257514e, 3da181e, 10bb2ae |

Gates: tsc 0/0 · eslint 0 · vitest 58 files / 412 tests · jest 408/408 · turbo build 3/3 ×3.
