# Run #228 — Cycle: P2-357 waitlist promotion live transition + reviews RBAC gate

## Gate 0 — Retrospective (compact)

**Board area audited:** match-detail realtime surface (P2-357) + admin RBAC (Reviewer A run-#228 finding).

**Claims verified (run #227):** PR #293 (`5f42e315`) + PR #294 (`a35805af`) both MERGED (gh pr view).
Watchdog §8b present in profile script (:153-154). F9 push gate still owner-blocked
(`GH_BACKUP_REPO=OWNER-STEP-PENDING` in `/home/ubuntu/.config/koralink/offsite.env`).

**Claims≠facts hit:** PR #294's row claims "can() wired on 12 HQ write surfaces" — TRUE for the
12 it lists, but `reviews/page.tsx` (hide/restore/delete at :347/:354/:373) carries NO `can()`
call and rbac.ts has NO `review.*` tokens (only a `reviews` SECTION). The run-#227 census
allowlist even documents the gap as "no review.* token" (NO_TOKEN_YET). Fixing this run.

**Tech debt scan:** cancelMatch held→cancelled flip lacks a rowCount check (Reviewer A #228,
cosmetic — predicate-guarded, idempotent, no money hangs on that specific write; the refund
sweep is independent). Not fixing (driver-by; noted for the next wallet/matches touch).
1Q/1R/1P Sentry singles = Nov-13 one-offs, stale. No other debt in touched areas.

**ADMIN STATE CHECK:** `git status apps/admin` clean at boot; owner not mid-flight in the
portal tree this run (no uncommitted admin edits). Safe to touch rbac.ts + reviews page.

## Gates 1-3 — Program design (compact, single doc)

**Problem:** a promoted waitlist player keeps a stale "#N in queue" bar; no live transition, no
in-app charge confirmation (money-adjacent UX). Root cause: gateway `join-lobby` gates the match
room on roster membership only; `notifyPromotion`'s `roster-update` broadcast never reaches the
queued viewer.

**User story:** as a waitlisted player on the match page, when a spot frees and I am promoted
(and my wallet charged), I see the page flip to the roster state live and a localized toast
naming the exact debit — without needing the push notification.

**Scope:**
- IN: gateway admits actively-waitlisted users to `match:<id>` room; promotion broadcast carries
  `chargedSar`; match page toasts promoted/charged transition (EN+AR, ICU `{amount}`); tests ×3
  surfaces; i18n parity.
- OUT: chat-send admission (stays roster-gated), waitlist UI redesign, push copy changes,
  schema changes (match_waitlist row-presence = queued; no status column).

**Architecture delta:** app.gateway.ts `handleJoinLobby` second lookup (match_waitlist EXISTS);
waitlist.service.ts `notifyPromotion` payload + chargedSar; match page roster-update listener +
transition toast; rbac.ts + reviews page gate (item 2, separate PR).

**Contract checklist (Gate 3):**
- [x] Broadcast payload: `{ promoted: string, chargedSar: number|null }` — additive, consumers
      that ignore chargedSar unaffected.
- [x] Frontend consumption: page guards `payload?.promoted === currentUserId` before toasting;
      transition requires `match?.yourWaitlistPosition != null` (queued at event time).
- [x] No silent undefined: `chargedSar: promotion.chargedSar ?? null` explicit.
- [x] i18n: `waitlist.promoted` + `waitlist.promotedCharged` in BOTH en.json + ar.json; ICU
      `{amount}` interpolation mirrors `waitlist.queuedOf` usage.
- [x] Money copy: names the exact debit (error-message standard applied to success-moment
      money transparency, mirrors P2-333 push copy).
- [x] No schema/migration changes (row-presence admission; no new columns).
- [x] Hex: no new import arrows — gateway already imports schema tables; page already imports
      realtime lib + formatMoney via existing patterns.

**Money-flow side-effect review (required for any room-admission change):** room membership =
"currently viewing" semantics only (gateway :445-449 comment). join-lobby does NOT charge,
credit, or mutate anything — admission is read-only (two SELECTs). Chat `send-message` path
gates on roster separately. mark-chat-read still requires a match_players row (queued users
cannot advance a watermark they don't have — correct, they have no roster row). No new writer
of Cancelled/Completed introduced. SAFE.

## Status table

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | run #228 | 00-retro.md |
| 1-3 | Program design | ✅ DONE (autonomous) | run #228 | this doc |
| 4 | Vertical slices | IN PROGRESS | — | lane/run228-p2-357 + lane/run228-reviews-rbac |
