# Run #170 — Gate 0 Retro + Program Design: StorageModule / venue photos (P1-38 first leg)

## Gate 0 — Retro (area audit)

- DECISIONS.md consulted first: 2026-10-25 owner decision = self-hosted object storage on VPS
  (SeaweedFS S3, LIVE, 127.0.0.1:8333, buckets koralink-venues/koralink-avatars, S3_* in
  .deploy-tokens). This slice implements the plan's "App integration" step 1-4 (API module,
  venues.images, admin form). No design/UX standard contradicted (Drawer rule, marketing rule
  untouched; admin form work follows the existing DataTable/RecordDrawer conventions).
- Admin state check (runbook 3.5 step 0): tree CLEAN in apps/admin + partner/admin API modules;
  service live; last admin commits = 6bede5d (restore-on-behalf) + 124f37a (settlements). No hold.
- Open-PR dup guard: only #178 (promote, owner-gated) open. No PR exists for storage/media. Clear.
- Recent-cycle areas reviewed by Reviewer A/B (dispatched this run): money path clean, run-#169
  claims all CONFIRMED, i18n parity 1152/1152 + 746/746, hex clean, zero new boundary violations.
- Migration convention state: 0056 last journal entry (idx per chain); hand-written SQL +
  journal append + prevId-linked snapshot COPY is the ONLY path (drizzle-kit generate dead on VPS).
- Serving constraint (00-plan.md): storage is 127.0.0.1-only — public serving rides an API media
  route; this slice ships that route (public read of venue photos is the product intent for P1-38).

## Gates 1-3 — Program design (compact)

### Problem / user story
Venue photos are the #1 conversion driver for players choosing clubs (P1-38). Storage backend is
LIVE but nothing can upload or serve an image. As a venue owner (partner) or HQ admin, I attach
photos to my venue; as a player, I see them (PWA consumption = next leg; this slice makes photos
exist + renderable via URL).

### Scope
IN: StorageModule (S3 client → SeaweedFS), POST /media/venues upload (multipart, ≤5MB,
jpeg/png/webp, sha256-named keys, owner-or-admin auth, @Throttle), GET /media/venues/:key public
serving (bucket-pinned, immutable cache), migration 0057 venues.images text[] (cap 6 at service),
partner PATCH /venues/:id images[] validation, admin venue form upload/remove UI + i18n EN+AR,
jest specs, observability (Sentry capture on storage failures, audit log).
OUT: PWA club carousel (next leg), avatar upload (P2-50 rides same infra later), image
moderation queue (Reviewer B P1 — boarded, needed before any PUBLIC upload path; admin/partner
uploads are trusted-origin content), partner-console upload UI (admin first per lane rotation).

### Architecture delta
- apps/api/src/infrastructure/storage/storage.module.ts (new) — S3Client from @aws-sdk/client-s3
  (CJS-safe), endpoint http://127.0.0.1:8333, bucket from env, boot-time config guard.
- apps/api/src/modules/media/ (new) — media.controller.ts (upload + serve), media.service.ts
  (mime sniff via magic bytes NOT trusted client type; sha256 key; venue ownership SQL inline —
  no cross-module service import, hex-clean).
- venues.images text[] (migration 0057, schema.ts declaration); service cap ≤6, dedupe,
  path-pattern validation ^/media/venues/[A-Za-z0-9/._-]+$.
- admin venue form: file input → apiFetch multipart (FormData passthrough added to admin fetch
  helper), preview grid, remove buttons, i18n 8 keys ×EN+AR.

### Contracts (Gate 3)
- POST /api/v1/media/venues (auth; multipart field `file`; query venueId) → 201
  `{ "path": "/media/venues/<venueId>/<sha256>.<ext>", "bytes": <n> }`
  Errors: 400 bad mime/oversize (DTO+interceptor), 401, 403 non-owner non-admin, 404 venue,
  429 throttled, 502 storage failure (Sentry captured).
- GET /api/v1/media/venues/:key(*) → 200 image bytes, Content-Type from stored metadata,
  Cache-Control public,max-age=31536000,immutable; 404 unknown key; only bucket koralink-venues.
- PATCH /api/v1/partner/venues/:id accepts `images: string[]` (0..6, pattern-validated,
  deduped) — response shape unchanged otherwise (findOne populated).
- Admin i18n keys: `venues.images`, `venues.imagesAdd`, `venues.imagesRemove`,
  `venues.imagesUploading`, `venues.imagesTooMany`, `venues.imagesBadType`,
  `venues.imagesUploadFailed`, `venues.imagesHint` (en + ar).

### Contract verification checklist
- [ ] Upload returns path consumable by the serve route (self-probe after build).
- [ ] venues.images reaches GET /partner/venues/:id + admin venue page (DB → SQL → adapter → UI).
- [ ] Every user-facing admin string has en+ar entries.
- [ ] Mutation (PATCH images) returns the populated venue object (contract §2 — updateVenue
      already returns findOne shape; images column added to its SELECT).
- [ ] No field silently undefined: images nullable — admin UI treats null/empty as [].

### Gate 3 verification (run before Gate 4)
- turbo build baseline green on staging HEAD before slice start (verify below).
- Tripwires 8/8 after journal+snapshot edit (jest drizzle-migration-journal + snapshot-chain).
