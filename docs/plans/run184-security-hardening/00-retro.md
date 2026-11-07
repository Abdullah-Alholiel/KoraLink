# Run #184 — Gate 0 Retro: Security hardening (P1-70 room eviction + P1-71 avatar_url validation)

**Date:** 2026-11-04T01:3xZ · **Lane:** run#184 % 4 = 0 → PWA screens rotation, but pick order
follows Phase 3.5: security/data-integrity beats the rotation focus. Both picks are
security-class board rows recommended by run #183 (P1-71 top pick, P1-70 second).

## DECISIONS.md consulted (Gate 0 supremacy)
Read first. No entry governs WS room membership or avatar URL formats; both items are
security hardening with zero design/UX change. No contradiction. Defaults+48h-veto register:
no row being built this run (both items are plain TODO board rows, not default proposals).

## Area audit
- **Realtime (P1-70):** `app.gateway.ts` gates `join-lobby` ONCE on roster membership
  (:416-440); room fan-out (`new-message` :644, `status-update` :991, `roster-update`,
  `pom-decided`) is unconditional to the room. `disconnectUser` (:983) exists but is wired
  only to admin bans. `removePlayer` (matches.service.ts tx ends ~:4095) and `leaveMatch`
  (:1839, tx ends ~:1975) delete the roster row and never touch the socket room. Audit
  run-5 R5-1 CONFIRMED (fingerprint `api-realtime:stale-room-membership-post-removal`),
  high confidence, remediation pre-approved by the audit itself.
  Also surfaced: run-5 R5-2 `leave-conversation` skips UUID-shape validation
  (needs_validation → keep on P1-70 row as follow-up note; NOT built this run — scope
  discipline).
- **Users (P1-71):** `UpdateProfileDto.avatar_url` is `@IsOptional() @IsString()` only
  (dto/update-profile.dto.ts:20-22); `updateProfile` persists the DTO verbatim
  (users.service.ts:467-472). The codebase's own invariant lives in
  `StorageService.isManagedAvatarPath` (common/storage/storage.service.ts:168-174).
  Strix run #183 HIGH.
- **Recent commits:** run #182/#183 shipped moderation + avatar UX + backup infra
  (PR #206/#207, 29b32c7). fix:feat ratio healthy (docs/security fix commits dominate a
  feature-stable window; no reactive fix loop on these areas).
- **Sentry triage (Phase 1.6):** all 7 API signatures dormant — newest lastSeen
  2026-10-31 (1C Neon quota tail, resolved). journalctl 5h clean. No new board rows.
- **Service health:** api/pwa/admin all active; API /health 200.
- **Hex lane:** clean (10/10 metrics at baseline: api_exc_total 337, raw_sql 66, 0 PWA/Admin
  raw fetch). No drift → no [Px][hex] row.
- **ADMIN STATE CHECK:** P1-71 touches `apps/api/src/modules/users/*` only; P1-70 touches
  gateway + matches. Neither touches apps/admin or partner/admin API surface.
  `git status` on all three apps: clean. Admin service active (informational). No hold.

## Findings classification
- CRITICAL: none.
- IMPORTANT (this run's builds): P1-70 (WS fan-out to removed player), P1-71 (unvalidated
  stored URL). Both mapped to user stories: removed player keeps reading lobby chat after
  removal (privacy/trust); arbitrary URL stored on user object (SSRF-ready primitive).
- MINOR (boarded, not built): AvatarUpload navigator.onLine vs useOnlineStatus (existing
  patterns), useLatestTopupIntent infinite poll (P2-287 follow-up note), watchdog prod-backup
  coverage (P2-303), locale-route loading.tsx gaps (P2-304 note in BOARD backlog).

## Gate 0 verdict
PROCEED to Gates 1-3 in autonomous mode. Both items are vertical-slice sized, no owner
call, no schema change, no new provider.
