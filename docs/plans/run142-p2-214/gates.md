# Run #142 Cycle — P2-214 partner directed bell (compact gates)

## Gate 0 — Retro (area audit)
- Area: apps/admin NotificationCenter + ops-activity-store (run #99 lineage), P1-67 payout notify (merged this run, b04de40).
- DECISIONS.md consulted: no design/UX conflict (Drawer stays shared/RIGHT; bell surface = console drawer, not a new global bell).
- ADMIN STATE CHECK: clean tree, admin svc active, 12 dashboard routes present; nothing in-flight.
- Tech-debt note: `isEntityInScope`VenueOwner-exclusion (run #99 stopgap) is the load-bearing constraint; P1-60 owner call remains the proper fix.

## Gates 1-3 — Program design (contract gate)
- Problem: partner learns of a paid settlement only in the player PWA (if they even use it); admin console shows nothing (ops feed excludes VenueOwner by design until P1-60).
- User story: As a venue partner, when the admin marks my settlement paid, I see a persistent "Settlement paid" item in my console bell that deep-links to /partner/earnings.
- Scope IN: partner-feed store (REST hydrate + socket append), NotificationCenter VenueOwner rendering, BellButton badge source, i18n EN+AR. Scope OUT: P1-60 tenant-scoped rooms (owner call), ops feed changes for admins, persistence across reloads.
- Contracts verified BEFORE code:
  - `payout_paid` ∈ DIRECTED_VERBS (activities.service.ts:72) → arrives via GET /users/me/notifications ✓
  - FeedItem JSON: {id, verb, actor{name}, match{title,venueName}|null, isRead, createdAt} ✓
  - Admin socket handshake joins personal room (app.gateway.ts:243) → `notification` event reachable on opsRealtime ✓
  - Bulk read: POST /users/me/notifications/read {} → {updated} ✓ (idempotent, marks all)
  - VenueOwner deep-link map already carried settlements→/partner/earnings (NotificationCenter.tsx:84) ✓
  - i18n: notifications ns; directed.* added EN+AR (parity checked programmatically) ✓
- Checklist results: mutation contract N/A (no API change — zero-API-diff slice); adapter N/A (mapApiItem is the adapter); no silently-undefined field (all FeedItem fields nullable-safe in renderer); i18n keys exist both locales ✓.

## Gate 4 — Slices
- Slice 1 (tracer): store hydrate + partner rows render (payout_paid → settlements row). Committed 0c17b05.
- Slice 2: realtime append (notification event), badge source swap, mark-read epoch guard, error/retry + loading states, i18n. Same commit (single-coherent slice, one review unit).
- Gates: tsc 0 · turbo 3/3 (sequential) · lint n/a for admin (turbo lint: no task) · PR #147 bot gates = CI-verified.
