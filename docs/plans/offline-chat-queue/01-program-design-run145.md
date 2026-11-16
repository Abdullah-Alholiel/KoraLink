# Run #145 — Program Design (compact; whole run)

Primary item: **P2-172 hardening** (offline chat queue follow-ups from Reviewer A on PR #149).
P2-216 (settlement window unification) was the directive pick but is **blocked by open PR #141**
(diff directly touches `partner.service.ts` + 3 partner specs — building it now forks the
money-path; P2-150 analog). Recorded decision, revisit after #141 merges.

## Problem
The queue merged in #149 had three latent defects (all Reviewer A, evidence-cited):
1. No TTL and no size cap: a message parked for a server-closed chat replay-fails on every
   flush cycle forever; localStorage grows unbounded; QuotaExceededError silently degrades
   the queue to in-memory-only.
2. Orphaned entries: an offline send during a logout race parked `userId: ''` — the flusher
   bails without a user, the backfill view filters on currentUserId → dead bubble forever.
3. Ack-timer leak: the 10s WS-echo timeout armed in `onMutate` kept running after a send was
   parked — any offline park longer than 10s silently flipped `queued` → `failed`.

## User story
As a player sending chat while offline, my message waits safely and sends when I reconnect;
it never rots in a broken state I cannot see or fix.

## Scope
IN: prune (7d TTL) + cap (50, drop-oldest) on every queue read; orphan guard at enqueue
(fail loudly instead of parking); ack-timer stand-down on park. 3 new specs.
OUT (deliberate): memoizing `getOfflineQueueCount` (naive useMemo would cache a value that
changes via module-side queue mutations React cannot observe — correctness risk > the
per-render JSON.parse cost); Reviewer A's `sendMessage` check-vs-insert window (boarded
P2-220 — different file, matches-module slice); money actions (owner decision stands).

## Contract deltas (exact)
- `readOfflineQueue()` now prunes: entries with `Date.parse(queuedAt) < now-7d` dropped
  (undateable entries KEPT — never destroy what we cannot date), then capped to last 50.
- `enqueueOfflineMessage(entry)`: returns false on dup (unchanged); after push, if
  `length > 50` → keep last 50 (incoming entry included as the last).
- `onError` OfflineSendSignal branch: `!currentUserId` → set bubble `failed`, clear ack
  timer, return (no enqueue, no toast); enqueue uses `userId: currentUserId` (non-null).
- Test mock store gained `__setActiveUser(u?)` (undefined restores user-me).

## Gate 3 verification checklist
- [x] No wire/API shape changes — PWA-only slice, no adapter/hook signatures altered.
- [x] All queue consumers still satisfied: flusher iterates `[...readOfflineQueue()]`
      (pruned copy), backfill maps filtered entries, count reads the same array.
- [x] Existing 6 specs unmodified and green (no behavior regression on the happy paths).
- [x] 3 new specs pin the new behaviors; suite 9/9; full PWA 979/979; tsc 0; eslint 0;
      turbo 3/3 (sequential).
- [x] No i18n changes (no new user-facing strings; orphan failure reuses existing
      failed-bubble retry UX).

## Verification evidence
- Suite: `npx vitest run test/hooks/offline-chat-queue.test.tsx` → 9/9.
- Full: 979/979 (133 files) · tsc --noEmit 0 · eslint --max-warnings 0 clean ·
  `npx turbo run build --concurrency=1` 3/3.
- Live E2E (staging API, dev-login seeds): createMatch 201 → join 201 → send 201 →
  replay (same clientMessageId) 201 → joiner sees exactly 1 → cancel 200.
