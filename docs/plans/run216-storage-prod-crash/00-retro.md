# Run #216 — Cycle Retro (P0 prod-deploy crash + P2-367)

## Incident: prod Render deploy broken since promote #276 (2026-11-18 17:45Z)

- Promote merge 6817194 (PR #276, 487 commits runs #187–#215) fired Render's
  auto-deploy-on-api-trigger. Deploy dep-dbuu8d59fdbs73b14bo0 crashed 2m32s in:
  `Storage env incomplete: S3_BUCKET_VENUES / S3_ACCESS_KEY / S3_SECRET_KEY are
  required` → StorageService constructor throw. StorageModule is `@Global`, so
  the provider instantiates on EVERY boot — no S3_* on Render (SeaweedFS is
  staging-only infra) = guaranteed crash loop → `update_failed` → prod kept the
  Sep-25 build while Vercel PWA+admin deployed the new code.
- Detection gap that let it ship: the promote health check verified Neon
  migrations (62/62) and CI, but NOTHING probed the Render deploy result, and
  Sentry was blind (the crashing build is what would report errors). Vercel
  checks went green, so the promote looked healthy.

## Root-cause class (new pitfall)

**Boot-time env throwers in @Global providers are prod-deploy killers.** The
boot-fail-loud pattern is correct for SECURITY invariants (JWT secrets,
Turnstile dummy-secret guard) but wrong for OPTIONAL INFRA (object storage,
push keys, email transports) whose absence should degrade a FEATURE, not the
PROCESS. The avatars half of StorageService already had the correct shape;
this incident is the venues half catching up.

## Fix (PR #277, squash 5a7fc88)

- Storage env optional at boot; `venuesConfigured` getter; venue-media methods
  degrade typed (put → 503 via MediaService mapping; get → null → 404;
  delete → no-op) — exact mirror of the avatars-half contract.
- NEW storage-boot.spec.ts (10 pins) + media 503 pin.
- Bonus CI unblock: users.restore.spec PDPL time-bomb defused (hardcoded
  deleted_at 2026-10-20 + 30d crossed the deadline 2026-11-19 — fixtures now
  relative to Date.now()).

## Second item: P2-367 RTL wrap guards (PR #278)

Re-audited every boarded nowrap site: MatchChat missed-marker dividers +
clubs favorites error strip were real; the chip rows (clubs filters,
FilterBar) are overflow-x-auto scroll patterns where nowrap is CORRECT —
documented, tripwire guards both the fixes and the scroll containers.

## Verification posture added this run

- Prod deploy health = Render deploys API (`status=live` on a post-fix SHA) +
  prod `/api/v1/health` carrying the `turnstile` block. Vercel statuses alone
  are NOT deploy health for the API.
- Prod heal is owner-gated (promote merge per D-20261113-28) — OWNER-QUEUE
  item 1 carries the exact path.

## Claims to verify next run (#217)

- PR #278 merged + PWA chunk carries `min-w-0` on the marker dividers.
- Prod Render deploy state (should still show the old failure until owner
  merges the promote; after merge: `live` + health turnstile block).
