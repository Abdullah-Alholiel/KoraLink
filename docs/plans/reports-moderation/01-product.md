# Gate 1 — Product Spec: Reports Moderation Queue

## Goal
Close the moderation gap: let players report abusive content/users, and give HQ admins a queue to triage and resolve reports.

## User stories
1. **As a player**, I can report a match, another user, or a venue with a reason, so moderators can act.
2. **As an admin**, I see an open-reports queue (status + subject-type filters, reporter + subject context) in the HQ console.
3. **As an admin**, I open a report's detail (reporter info + the reported subject), mark it `reviewing`, and resolve it (`resolved` with a resolution note, or `dismissed`).
4. **As an admin**, resolving a report on a *user* can optionally ban that user (reuses existing `user.ban` semantics).

## Scope (v1 vertical slice)
- **In:** report creation (user/match/venue), admin list + detail + resolve, optional ban-on-resolve, audit logging, realtime ops refresh.
- **Out:** evidence uploads/attachments, user appeal flow, automated moderation, per-report notification to the reporter, venue-owner report view.

## Success criteria
1. End-to-end data flow verified: PWA report → DB row → admin queue → resolve → `audit_logs` + status change.
2. `turbo run build` zero errors; `npx tsc --noEmit -p apps/api/tsconfig.json` zero errors; `npx vitest run` (from `apps/player-pwa`) green.
3. Every user-facing string is in `ar.json` + `en.json`.
