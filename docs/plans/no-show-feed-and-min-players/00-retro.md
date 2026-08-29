# Gate 0 — Retrospective: no-show feed bug + underfill protection

**Date:** 2026-08-29 · **Baseline:** main HEAD

## Evidence (DB-verified)

Match `35a467ef` "Kill" — host **Omar Al-Shahrani** (`7e087c00`), roster = **1 player (Omar himself)**,
`no_show = f` for everyone. Yet Omar received **4** `no_show_marked` notifications (Aug 28, 08:23)
where **Omar is the actor** — he notified himself by toggling no-show on the only roster entry (himself).

Also found: **2 auto-opened `no_show` disputes** on that match with Omar as reporter vs himself (garbage).
The Aug-27 notifications (Yousef → Omar, match `2769facf`) are legitimate — kept.

## Root causes

1. `markNoShow()` passes `excludeActor: false` to `activitiesService.record()` — needed for the
   *marked player* case, but nothing prevents `targetUserId === hostId` (self-notification).
2. No guard against the host marking **himself** as no-show (API-level; UI doesn't offer it but the API allows it).
3. Unmarking (`noShow=false`) also fires the "You were marked as a no-show" notification — wrong direction.
4. `no_show_count` was NOT corrupted (stays 0) — the idempotency guard worked; only notifications/disputes leaked.

## Tech-debt notes (carried, not blocking)

- Manual `cancelMatch()` does not create a bell notification for players (WS broadcast only) — out of scope here.
- Feed/directed verbs list must be kept in sync across: API `DIRECTED_VERBS`, PWA `useFeed.ts`,
  `ActivityCard`, `NotificationSheet`, `NotificationProvider`, `en.json`, `ar.json` (7 places).

## Decision

Proceed to Gate 1. Fix ratio healthy; this cycle = 1 bugfix + 1 feature with shared notification plumbing.
