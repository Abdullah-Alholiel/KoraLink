# Admin Dashboard — Gate 0 Retrospective

**Date:** 2026-08-16 · **Branch:** main · **Baseline:** d5363b4 (production-hardening #14)

## Preflight (hard gates)
- gh auth ✅ `Abdullah-Alholiel` (fullstack-dev GH_CONFIG_DIR)
- git status ✅ clean, on `main`
- node v22.22.3 / npm 10.9.8 ✅

## Context
Abdullah provided 5 reference screenshots of an admin ecosystem. OCR + schema audit
reveal the inspiration describes **three roles**, which map cleanly onto the existing
`UserRole` enum (`Player | VenueOwner | Admin`):
1. **KoraLink HQ Console** (`Admin`) — screens 1 (dispute resolution + venue approval),
   3 (mission control / financials / disputes), 4 (venues & pitches directory).
2. **Venue Partner portal** (`VenueOwner`) — screens 2 (pitch inventory) & 5 (venue daily dashboard).
3. **Player PWA** (`Player`) — already built.

## What already exists (no new work)
- `users.role` enum with all 3 roles ✅
- JWT payload already carries `role` (`auth.service.ts` verifyOtp) + `JwtPayload.role` ✅
- `venues.is_approved`, `is_koralink_partner`, `owner_id`, `amenities`, `location` ✅
- `pitches` (size/surface/environment/hourly_rate) + `pitch_slots` (booking) ✅
- `transactions` (CREDIT/DEBIT, idempotency_key, status) ✅
- matches lifecycle + POTM, messaging, votes, follows, activities, push subs ✅
- CORS already reserves `adminUrl` origin in `main.ts` ✅
- Observability (Sentry/Pino/PostHog) + Throttler + Pino logging wired ✅

## Gaps to close (Gate 4 build)
1. **RBAC guards** — `AdminAuthGuard` + `@Roles()` decorator (role already in JWT). Fix
   `devLogin()` to include `role`.
2. **Disputes** — new `disputes` + `dispute_messages` + `dispute_evidence` (no-show appeal,
   double booking, pitch condition, unrecognized charge).
3. **Venue business verification** — `venue_verifications` (legal entity, CR, tax ID, IBAN,
   manager contact).
4. **Payouts/settlements** — `settlements` table + `SETTLEMENT`/`PAYOUT` reference types.
5. **Audit log** — `audit_logs` (admin_id, action, entity, before/after, ip).
6. **Reports/flags** — `reports`.
7. **Moderation fields** — `users.banned_at`, `suspended_until`, `verification_status`,
   `last_seen_at`.
8. **Pitch availability/gallery** — `pitches.is_active`, `pitches.images`.
9. **Platform settings** — `app_settings` (key/value: margin, grace period, flags).
10. **Admin app** — new `apps/admin` (Next.js App Router + Tailwind + TanStack Table +
    Recharts), desktop-first, admin auth, observability.

## Decision (scope)
Build **HQ Console** now; schema + RBAC designed to serve **both** portals; Venue Partner
UI is a follow-up cycle. Every mutation returns a fully-populated object (mutation contract).

## fix:feat ratio
Recent commits are hardening/fix-heavy (expected post-launch). Admin cycle is net-new
`feat` work on a stable base — no reactive-fix loop to unwind.
