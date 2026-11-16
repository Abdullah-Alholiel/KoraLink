# Run #126 — Gate 0 Retrospective (ADMIN lane, 2026-10-12T15:18Z)

**Lane:** run 126 % 4 = 2 → Admin. ADMIN STATE CHECK passed (tree clean, service active,
no owner WIP) → **no admin-area item is buildable without owner decisions** (P2-1, P2-134,
P2-144, P2-47, P1-59 all owner-gated). Build picks shifted to the two buildable board rows:
P2-181 (user-visible, via zeroshot lane) + P2-140 (the one hardening item).

**DECISIONS.md consulted first:** no decision or standard touched by this run's changes
(toast i18n aligns WITH the EN+AR marketing standard; status predicates are pure API
hardening). No conflicts.

## Area audits
- **useMatchActions.ts** (P2-181 target): 386 lines; 5 hardcoded success/info toasts
  (:163/:262/:282/:305/:328) beside fully localized error paths (P2-159 pattern). No test
  pins the old strings. `gameDetails` ns exists in both locales (11 keys, parity exact).
- **matches.service transitions** (P2-140 target): start/complete/cancel hold `.for('update')`
  locks + in-tx checks (P2-49, run #37); the status UPDATEs themselves were predicate-free.
  Disputes `resolve()` (PR #105) is the in-repo reference pattern (predicate + returning
  guard + 409). `inArray` + `ConflictException` already imported.
- **Tech debt noted:** disputes `update()` intentionally allows edits in ANY status
  (documented) — Reviewer A's "no status predicate" finding there is BY DESIGN, not debt.
  Logged as refuted, no change made.

## Refuted reviewer findings (claims ≠ facts, verified this run)
1. Reviewer A: `useMatchActions.ts:1320` `${currentUserId ?? null}::text` SQL-NULL
   interpolation → **refuted**: file is 386 lines; pattern absent repo-wide in PWA src.
2. Reviewer A: disputes.service.ts:374 partial UPDATE lacks status predicate → **refuted by
   documented contract**: "Edit a dispute's decision/internal note in ANY status …
   post-decision corrections are the point."
3. Reviewer B (P1): sw.js has zero push handlers → **refuted**: handlers live in
   `worker/index.js:216` (push) / `:279` (notificationclick) / pushsubscriptionchange; the
   generated sw.js importScripts the served `worker-<hash>.js` chunk (verified in build
   output). B grepped only public/sw.js. No new board row.

## Gate 0 verdict
Proceed: two scoped picks, both lane-branch PR flows, full gates parent-side.
