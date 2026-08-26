# Media Storage Decision — pre-work for social-feed media

**Status:** DECIDED (Gate 2-level design lock, 2026-08-26) · **Owner:** KoraLink factory
**Context:** `ios-native-and-scalability` Slice 4 — lock the storage contract BEFORE any media slice is built (social-discovery feed media, avatars, match photos).

## Decision

**S3-compatible object storage with presigned uploads, delivered via the provider CDN. Recommended provider: Cloudflare R2; acceptable alternative: AWS S3 + CloudFront.**

Rationale:
- KoraLink API already runs the upload authorization point (NestJS, JWT-guarded). The client never touches provider credentials — it asks the API for a presigned PUT URL, uploads directly to the bucket, and the API stores only the object key.
- R2 advantages for a Saudi audience: zero egress fees, S3 API compatibility (swap = env vars only), simple custom-domain CDN.
- `next/image` stays the render path: set `images.remotePatterns` for the CDN domain (and later a custom loader if we need on-the-fly resize params).

## Contract (for the future Gate 3 of the media cycle)

1. **Endpoints** (API, under `/api/v1/media`):
   - `POST /media/presign` — body `{ kind: 'avatar' | 'match-photo' | 'feed-post', contentType, sizeBytes }` → `{ uploadUrl, objectKey, publicUrl }`. Validates MIME allowlist (image/jpeg, image/png, image/webp) and size cap (≤ 8 MB).
   - `POST /media/confirm` — body `{ objectKey }` → verifies object exists (HEAD), persists reference (e.g. `users.avatar_url` / future `media` table), returns the populated parent entity (Mutation Return Contract).
2. **DB**: `avatar_url` (existing text column) stores the **public CDN URL**; a future `media` table (id, uploader_id, kind, object_key, url, bytes, created_at) only if/when multi-image feed posts land.
3. **Client**: upload flow = presign → PUT (direct to bucket, no API hop for bytes) → confirm → invalidate React Query key.
4. **Removal**: deleting a user/photo deletes the object (bucket lifecycle rule as backstop, 30-day orphan sweep).
5. **Env** (API): `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MEDIA_CDN_URL`. PWA: CDN domain added to `next.config.mjs` `images.remotePatterns` + CSP `img-src`.

## Why not the alternatives

| Option | Rejected because |
|---|---|
| Local disk on the VPS (like current approach for anything static) | No CDN, no durability, dies with the box; already a known scaling ceiling |
| Firebase/Supabase Storage | Introduces a second auth/provider stack for one job; S3-compatible covers it with less lock-in |
| Base64 in Postgres | Bloats DB + payload sizes; worst option at any scale |

## Trigger

This doc is a decision, not an implementation. Implementation begins in the first media-bearing cycle (social-discovery feed media or avatar upload), through its own Gates 1–3.
