# Gate 0 — Retrospective: Reports Moderation Queue

## What we found
- `reports` table is **fully designed but orphaned** — defined in `schema.ts` (line 823) with `reportStatusEnum` (`open`/`reviewing`/`resolved`/`dismissed`) and a `reports_status_idx` index, but **zero code references it** (no controller/service/endpoint/UI). Confirmed via graph + grep.
- `users.verification_status` is a dead column (defaults `pending`, never written) — tracked separately, NOT in scope here.

## Reference pattern (do not reinvent)
The `disputes` moderation flow is the proven template and mirrors our target 1:1:
- **User creation:** `POST /matches/:id/dispute` (feature module) → `disputes` table.
- **Admin review:** `admin/disputes` — `list()` (raw SQL LEFT JOINs, `::text` casts), `findOne()` (drizzle `with:` relations), `resolve()` (guard → side-effects in tx → `withTimestamp()` update → `audit.log` → `realtime.broadcastOps` → return `findOne`).
- **DTOs:** `ListDisputesDto` (`status` + `page`/`perPage`), `ResolveDisputeDto` (`outcome` + `decision` + `internalNote`).

## Tech-debt decisions for this cycle
1. Extend `reports` with resolution fields (mirror `disputes`): `resolved_by` (FK users, set null), `resolution` (text), `resolved_at` (tz), `updated_at` ($onUpdateFn). Add `subject_type` index.
2. `reportStatusEnum` is already correct — reuse as-is (`open`→`reviewing`→`resolved`/`dismissed`).

## Risks
- Migration must be generated + applied (`db:generate` → `db:migrate`); Postgres is live at `localhost:5432`.
- `subject_type` is a free varchar — validate against a fixed union in DTOs to avoid junk values.
