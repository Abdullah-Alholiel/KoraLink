# run217-p2-385 — storage degradation hardening trio

## Gate 0 (compact)
Reviewer A #216/#217 + PR-Agent #277 r1 MINORs all flagged the same class on
the storage→media boundary: contract-by-prose, incomplete configured-check,
silent degrade paths. Scope = apps/api storage.service.ts + media.service.ts
(+ their specs). ADMIN STATE CHECK: apps/admin + partner/admin API modules
clean (no in-flight work) — not touched anyway (API lane).

## Gates 1-3 (compact — contract)
- **(a) Sentinel**: `StorageNotConfiguredError(surface)` exported from
  storage.service; both putVenueImage/putAvatar throw it; media.service maps
  by `instanceof` (prose `.includes()` matches RETIRED). Error copy unchanged
  (`venues bucket not configured` / `avatars bucket not configured`) so
  message-level pins still hold.
- **(b) Endpoint strictness**: `venuesConfigured` now requires an EXPLICIT
  `S3_ENDPOINT` (constructor localhost default = dev convenience, not
  configuration). Staging .env sets S3_ENDPOINT → zero behavior change live.
  POSTURE CHANGE for hypothetical bucket+creds-without-endpoint envs: they
  now degrade typed instead of PUTting against 127.0.0.1.
- **(c) Observability**: unconfigured getVenueImage/deleteVenueImage emit a
  first-occurrence `logger.warn` + `Sentry.captureMessage(scope=storage.degraded)`
  before degrading null/no-op — a misconfigured env is now visible in logs
  and Sentry instead of silently looking like deleted photos.

## Contract verification checklist
- [x] Upload 503 message unchanged: 'Venue photo storage is not configured.' /
      'Avatar storage is not configured.' (PWA-visible surface identical)
- [x] media.service.spec: 503 pin now throws the sentinel + NEW deploy-skew
      pin proves a plain Error with the old copy → 500 (prose path retired)
- [x] media.avatar.spec 503 pin → sentinel
- [x] storage-boot.spec: +4 pins (sentinel class ×2, endpointless degrade,
      explicit-endpoint positive); endpoint-defaults pin FLIPPED (posture)
- [x] jest touched suites 3/3 (35 tests), tsc --noEmit 0
- [x] Whole-tree sweep: no other prose-contract consumers, no external
      venuesConfigured consumers
- [x] .env.example documents the S3_* trio + the explicit-endpoint rule
- [x] Sentry quiet on config gaps at upload (existing), NEW warn-level
      degrade message only on unconfigured serve/delete
