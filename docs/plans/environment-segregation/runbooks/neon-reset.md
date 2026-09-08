# Neon Reset — clean production DB (Phase 1, after dev-login OFF)

> Tier **T2**. DESTROYS all data in the Neon project `falling-frost-44866281`.
> Gate: only AFTER OTP go-live (no dev-login path exists anymore) and Abdullah's explicit go.

## Why data dies here

Neon currently holds demo/seed data (dummy phones, test matches). Real-user production
starts empty; keeping seed rows would leak dummy phones into a real product.

## Steps

1. **Snapshot first (undo must exist)**: from a machine that resolves `*.neon.tech`
   (VPS shell cannot — DNS-blocked):
   `pg_dump "$NEON_DATABASE_URL" --schema=public --file=neon-pre-reset-$(date +%F).sql`
   Store it next to the VPS backup chain; confirm size > 10KB.
2. **Reset** — order matters (FK-safe, and schema comes from migrations, not dumps):
   ```sql
   DROP SCHEMA public CASCADE;
   DROP SCHEMA drizzle CASCADE;      -- journal dies too; recreated in step 3
   CREATE SCHEMA public;
   ```
3. **Rebuild schema from the migration chain** (the same files that ran on staging):
   apply `apps/api/drizzle/<NNNN_*.sql` in filename order + `drizzle/gist_indexes.sql`
   content + PostGIS `CREATE EXTENSION IF NOT EXISTS postgis` FIRST (koralink-postgres
   convention), journaling each sha256 as you go.
4. **Verify**: table count matches the VPS DB minus seed-only artifacts;
   `/health` 200; a fresh OTP signup creates a user (E2E, real device).
5. **Keep-warm check**: the Render keep-warm cron keeps hitting `/health` (no data
   dependencies) — confirm its target path still exists.

## Rollback

Restore the step-1 snapshot into a scratch DB first, verify, then swap connection strings.
Never restore blind into prod.
