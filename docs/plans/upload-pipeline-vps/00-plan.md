# Upload Pipeline on VPS — SeaweedFS S3 storage (DEPLOYED 2026-10-25)

**Decision:** self-hosted object storage on the VPS (Abdullah: lean, free, no new accounts).
**Status: LIVE** — deployed and E2E-verified end of 2026-10-25.

## Why SeaweedFS (not MinIO)
- **MinIO community edition was ARCHIVED** — dl.min.io returns 410 "no longer maintained /
  no security updates" for ALL community binaries, and the `minio/minio` Docker Hub namespace
  is pull-denied from this VPS. MinIO is not installable lean anymore; do not re-attempt.
- **R2** remains dashboard-gated on the Cloudflare account (API error 10042) — revisit at
  public launch if needed.
- **SeaweedFS 4.50** (Apache-2.0, active): single Go binary, built-in S3 gateway with IAM,
  systemd --user service (same ops pattern as koralink-api), zero cost, ~40MB RSS idle.

## What is running (verified)
- Binary: `/home/ubuntu/.local/bin/weed` v4.50 (linux-arm64, GitHub releases)
- Service: `systemctl --user status koralink-storage.service` (enabled, Restart=always)
- Mode: `weed server` (master+volume+s3 in one) bound to **127.0.0.1 only** —
  S3 :8333 · master :9333 · volume :18080 (8080 taken on this box)
- Data: `/home/ubuntu/seaweedfs-data` (volumeSizeLimitMB 1024, auto volume growth)
- Buckets: `koralink-venues`, `koralink-avatars` — owner identity `koralink-app`,
  scoped actions Read/Write/List/Tagging per bucket
- Credentials (in `.deploy-tokens`): `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_ENDPOINT`
  (http://127.0.0.1:8333) / `S3_REGION=us-east-1` / `S3_BUCKET_VENUES` / `S3_BUCKET_AVATARS`
- E2E proof (2026-10-25): SigV4 PUT+GET roundtrip OK both buckets; unsigned GET → 403 ✓

## Ops
- Logs: `journalctl --user -u koralink-storage -f`; restart: `systemctl --user restart`
- Access is localhost-only: the API (same VPS) talks to it directly; PWA uploads go through
  the API (proxy/presign), never straight to storage — no public exposure, no CSP change
  needed for staging. Public serving of venue photos rides a future API media route or the
  Cloudflare phase (owner decision then).
- Backup note: data dir is on the VPS disk; add to any future VPS backup scope (P1-18).

## App integration (factory lane — next)
1. API `StorageModule`: S3 client → 127.0.0.1:8333 (aws4 signing; `S3_*` envs), upload via
   API endpoint with size/type caps (≤5MB, jpeg/png/webp), sha-prefixed immutable keys.
2. DB: `venues.images text[]` migration (P1-38) + `users.avatar_url` write path (P2-50).
3. PWA: venue photo carousel (clubs list + detail), avatar picker on profile.
4. Admin: image field on venue form + partner portal. i18n EN/AR; Sentry + PostHog events.

## Rollback
`systemctl --user disable --now koralink-storage` + delete data dir. Nothing else depends on it.
