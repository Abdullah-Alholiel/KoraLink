# Upload Pipeline on VPS — MinIO via Coolify (owner decision 2026-10-25)

**Decision:** self-hosted object storage on the VPS (Abdullah: "lean storage… free to host
on my vps… no costs"). R2 was evaluated first (FREE tier 10GB, zero egress) but the
Cloudflare account has R2 disabled (API probe: error 10042 "enable R2 through Dashboard")
— that's a dashboard-only step; revisit R2 at public launch if VPS storage strains.

## Chosen: MinIO as a Coolify service
- Coolify is installed on this VPS (v4.0.0-beta.462) and **completely empty** (0 projects,
  0 services — API-verified 2026-10-25) — so it's idle capacity, zero new cost.
- MinIO = S3-compatible API → the app code uses the standard S3 SDK shape; migrating to
  R2/S3 later = endpoint+keys change only, no code rewrite.
- Free, no billing, no new account. Network posture: bind to Tailscale IP only.

## Topology
- Coolify service `minio`, image `minio/minio`, command `server /data --console-address ":9001"`
- Ports: 9000 (S3 API, internal), 9001 (console, Tailscale-only)
- Volume: `minio-data` (bind under /data/minio or Coolify-managed)
- Env: `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (generated, in `.deploy-tokens` as
  `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — agent never echoes values)
- Buckets: `koralink-venues` (public-read via anonymous policy), `koralink-avatars` (private,
  served through short-lived presigned URLs or the API proxy)
- Auth: Coolify behind Tailscale/tailnet like the rest of the stack; do NOT expose 9001 publicly.

## App integration (factory lane, after MinIO is up)
1. API `StorageModule` (S3 client → MinIO endpoint `http://100.93.99.24:9000`), upload via
   presigned PUT from the client (size/type caps: e.g. ≤5 MB, jpeg/png/webp only).
2. DB: `venues.images text[]` migration (P1-38) + `users.avatar_url` write path (P2-50).
3. PWA: venue photo carousel (clubs list + detail), avatar picker on profile.
4. Admin: image URL/list field on venue form + partner portal.
5. Observability: Sentry on upload failures; PostHog upload events. i18n EN/AR.
6. Serve venues bucket via public read (cache-friendly, immutable filenames: sha-prefix).

## CSP note
PWA CSP must allowlist the image host (Tailscale IP:9000 for staging; revisit for public prod —
a future public face for MinIO would ride the Cloudflare DNS phase, with R2 as the likely swap).

## Rollback/undo
Bucket data is disposable (dummy photos first). Removing the Coolify service + reverting the
migration is the undo. No prod surface touched until the promote that carries the code.
