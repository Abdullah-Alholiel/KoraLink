# Prod Migrations — Neon (Render pre-deploy is PAID-only; never rely on hooks)

> Execute BEFORE any promote that ships schema changes. Tier **T2** (prod DB writes).

## Why this runbook exists

Render auto-deploys `main` with NO migration step (P2-51). The only safe order on the free
tier is: **schema first, code second** — old code must tolerate the new schema for the
minutes between SQL application and the Render build finishing.

## Steps

1. **Ship the migration through staging first.** It must be journaled on the VPS DB and the
   API must have run with it (deploy-staging does this automatically).
2. **Export SQL to apply on Neon.** Source = `apps/api/drizzle/<NNNN_*.sql` files not yet on
   Neon. Get Neon's state: the Render API env-var `DATABASE_URL` (read via
   `GET /v1/services/{id}/env-vars`, token in `.deploy-tokens` as RENDER_API_KEY). From any
   machine that can resolve `*.neon.tech` (the VPS cannot — DNS-blocked): use `psql` or the
   Neon dashboard SQL editor.
3. **Journal check on Neon** — avoid re-applying:
   ```sql
   SELECT count(*) FROM drizzle.__drizzle_migrations;   -- table may not exist yet
   ```
   Missing table = create per drizzle convention (`drizzle` schema, `hash text,
   created_at bigint`), then backfill hashes for every file ≤ the last-applied index
   (same procedure the VPS journal reconciliation used 2026-09-08).
4. **Apply pending files** in filename order, splitting on `--> statement-breakpoint`,
   tolerating only duplicate-object errors. After each file: insert its sha256 journal row.
5. **Verify**: `SELECT count(*) FROM drizzle.__drizzle_migrations` ≥ VPS journal count minus
   intentional deltas; smoke-read the touched tables.
6. **Only then** run the promote (`promote-flow.md`). After Render goes live: hit
   `/api/v1/health` and one endpoint that touches the new schema.

## Rollback

Neon: restore from point-in-time backup (Neon console, ~6h window on free) or apply the
inverse SQL. This is exactly why migrations must be staged-verified and applied off-hours.
