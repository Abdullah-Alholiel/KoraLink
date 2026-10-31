# Run #182 Cycle — Program Design (Gates 1–3 compact) + Status

## Item 1 — P2-291 venue-review moderation (zeroshot lane 01a19299, parent accepts)

**Problem:** venue reviews are publicly visible forever; a fake/abusive review has no ops
recourse except the generic reports flow (apps/admin has zero venue_reviews references).

**User story:** as an HQ operator I can list every venue review with venue + author, hide
an abusive review from the player surface, restore it, or delete it — each action audited.

**Scope:** IN — additive `hidden_at` migration (0058), admin list/hide/restore/delete API
with AuditService rows, public GET filters hidden rows, admin /reviews DataTable +
RecordDrawer page + nav item, i18n EN+AR. OUT — rating_avg/rating_count recompute on
hide/delete (documented follow-up), moderation queues, partner-facing surfaces.

**Contract (exact shapes):**
- `GET /admin/venue-reviews?venueId&hidden&page&perPage` → `{ reviews: [{ id, rating,
  comment, hidden_at, updated_at, venue: { id, name }, user: { id, full_name } }], total }`
- `POST /admin/venue-reviews/:id/hide` → updated row (guarded UPDATE `WHERE hidden_at IS
  NULL`; 0-rows → 404 missing / idempotent already-hidden). Audit `venue_review.hide`.
- `POST /admin/venue-reviews/:id/restore` → inverse (audit `venue_review.restore`).
- `DELETE /admin/venue-reviews/:id` → `{ id }` (audit `venue_review.delete` with before).
- Public `GET /venues/:id/reviews` gains `AND vr.hidden_at IS NULL`.
- Migration 0058: `ALTER TABLE venue_reviews ADD COLUMN hidden_at timestamptz;` + journal
  entry idx 59 (when = prev+1000) + 0058 snapshot COPY of 0057 (fresh uuid4,
  prevId=4bd910e3-8369-484b-9225-8fd448032087, + hidden_at column entry).

**Gate 3 checklist (parent-verified against live code before lane dispatch):**
- [x] venue_reviews columns/indexes read from schema.ts:953-979 (not memory)
- [x] AuditService.log signature + executor param read from audit.service.ts
- [x] Admin controller guard/pipe pattern read from settlements.controller.ts
- [x] Admin client/api/page/component conventions read from lib/api.ts + (dashboard) tree
- [x] Public GET SQL read from venues.service.ts:576-638; aggregates confirmed as COLUMNS
- [x] Journal tripwire contract (idx/version/when/prevId chain) taken from _journal.json
- [x] i18n parity requirement (leaf counts equal) both locales

## Item 2 — P2-296 AvatarUpload error UX (parent-built, PR #206)

**Problem:** oversized photos upload fully before a 413; 403-flag-off shows the generic
connection-failure toast. **Contract:** client gate mirrors MAX_AVATAR_BYTES (2 MB) with
the existing `avatarTooLarge` key; new `avatarDisabled` key EN+AR on 403; regex classes
stay (P2-283 plumbing follow-up). **Verified:** 3 tripwire specs, vitest 155/1160, tsc 0,
parity 1177=1177.

## Status table

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ compacted above | this file |
| 2 | Architecture | ✅ compacted above | this file |
| 3 | Program Design | ✅ checklist run live | this file |
| 4 | Vertical Slices | 🔄 IN PROGRESS | lane 01a19299 + PR #206 |
