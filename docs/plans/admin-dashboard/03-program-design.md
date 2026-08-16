# Admin Dashboard — Gate 3 Program Design (contracts)

## Auth
- JWT payload: `{ sub, phone, role }` (already produced by verifyOtp). `devLogin` must add `role`.
- `AdminAuthGuard` rejects unless `role === 'Admin'`. `VenueRoleGuard` allows `Admin|VenueOwner`.

## New tables (Drizzle, all id varchar(36))
- `disputes(id, match_id?, reporter_id, respondent_id?, type, status, evidence json, decision, decided_by?, internal_note?, policy_ref?, created_at, updated_at)`
- `dispute_messages(id, dispute_id, author_id, content, created_at)`
- `venue_verifications(id, venue_id, legal_entity_name, commercial_reg, tax_id, iban, manager_name, manager_phone, status, submitted_at, reviewed_by?, reviewed_at?)`
- `settlements(id, venue_id, amount, period_start, period_end, status, payout_ref?, paid_at?, created_at)`
- `audit_logs(id, admin_id, action, entity_type, entity_id?, before?, after?, ip?, created_at)`
- `reports(id, reporter_id, subject_type, subject_id, reason, status, created_at)`
- `app_settings(key pk, value json, updated_at)`
- Columns: `users.banned_at`, `users.suspended_until`, `users.verification_status`, `users.last_seen_at`; `pitches.is_active`, `pitches.images`.
- Enums: `DisputeType`, `DisputeStatus`, `SettlementStatus`, `VerificationStatus`, `ReportStatus`; add `SETTLEMENT`, `PAYOUT`, `ADJUSTMENT` to `ReferenceType`.

## Key endpoints (all `@UseGuards(AdminAuthGuard)`, prefix `/api/v1/admin`)
- `GET /admin/metrics` → `{ totals: { users, matches, venues, pitches, disputes_open, float_held, pending_payouts }, completionRate, disputeRate, avgResolutionHours, revenueSeries[], matchesPlayedVsCancelled[], disputeRateSeries[] }`
- `GET /admin/users?search=&role=&status=&page=` → `{ users: AdminUser[], total, page }`
- `PATCH /admin/users/:id` (suspend/ban/role) → `AdminUser` (fully populated)
- `GET /admin/venues?search=&status=&city=&page=` → `{ venues: AdminVenue[], total }`
- `GET /admin/venues/:id/verification` → `VenueVerification`
- `POST /admin/venues/:id/approve` / `.../reject` → `AdminVenue` (with verification)
- `GET /admin/disputes?status=` → `{ disputes: Dispute[], total }`
- `GET /admin/disputes/:id` → `DisputeDetail` (messages, evidence, match)
- `POST /admin/disputes/:id/resolve` `{ decision, internalNote }` → `DisputeDetail`
- `GET /admin/transactions?status=&type=&page=` → `{ transactions: AdminTransaction[], total }`
- `POST /admin/transactions/:id/refund` → `Transaction` (populated)
- `GET /admin/settlements` / `POST /admin/settlements/:id/pay` → `Settlement`
- `GET /admin/audit-logs?admin_id=&entity_type=&page=` → `{ logs: AuditLog[], total }`
- `GET/PUT /admin/settings` → `AppSettings`

## Mutation contract (hard rule)
Every POST/PATCH/DELETE returns the fully-populated resource via `findOne`/relational
query **outside** the transaction. No bare `.returning()` rows, no `{ message }` objects.

## i18n
Admin is an internal desktop tool → English-first, no ar/en PWA i18n requirement.
