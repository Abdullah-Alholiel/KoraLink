# Run #34 — Last-admin ghost guard — Gates 0-3 (compact)

## Gate 0 — Retro (area audit)

Area: `apps/api/src/modules/admin/users.service.ts` (the PDPL ghost-guard surface, last touched
by f40acd9 in the 2026-09-05 repair session).

- The run #32 ghost guards landed `status=active` excludes ghosts (list) + `update()` 409s
  ghosts (target-side). Reviewer A (this run) found the guard was applied **one function short**:
  the last-admin protection count (users.service.ts:170-180) filters
  `role='Admin' AND banned_at IS NULL AND (suspended_until IS NULL OR <= now())` but has **no
  `deleted_at IS NULL`** clause.
- Cascade: the hard-purge anonymizer (`purgeExpiredAccounts`, run #30) deliberately leaves
  `role='Admin'` on the anonymized row; soft-deleted admins keep everything during the 30-day
  grace. So a ghost admin counts as a "living" admin. With 2 admins where one is deleted,
  `count=2` → the guard passes → the **last living admin can be demoted or banned** → HQ console
  permanently locked out (no admin left to undo it; restore-on-behalf doesn't exist yet — P2-47).
- fix:feat ratio last 15 commits: 6 fix / 5 feat / 4 docs+infra — healthy, not reactive.
- Admin state check (§3.5 step 0): `git status --short apps/admin apps/api/src/modules/admin*`
  → clean; admin service active. Owner's WIP is confined to player-pwa host files (untouched).

## Gate 1 — Product spec

- **Problem**: an admin whose account is soft-deleted or hard-purged still satisfies the
  last-admin guard, enabling a demote/ban that locks the console.
- **User story**: as KoraLink ops, banning/demoting the final *living* admin must be impossible,
  regardless of how many ghost admin rows exist.
- **In scope**: the count predicate in `AdminUsersService.update()` + jest coverage.
- **Out of scope**: restore-on-behalf (P2-47, needs owner decision); any UI change (guard is
  API-side; the UI already hides actions on deleted rows).
- **Success criteria**: ghost admins excluded from the count SQL (tripwire-verified); count=1
  (living) still blocks with 400; count≥2 proceeds; all existing specs stay green.

## Gate 2 — Architecture

- Single-file delta: `apps/api/src/modules/admin/users.service.ts` — one AND clause added to the
  existing count query. No schema/migration (deleted_at column already exists). No API shape
  change (same 400 error). No frontend change.

## Gate 3 — Program design (contract)

- Endpoint behavior unchanged except: demote/ban of the last living admin now correctly 400s
  `Cannot demote or ban the last active admin account.` even when ghost admins inflate the raw
  admin-row count. Error JSON shape identical (existing BadRequestException filter).
- TS: no signature changes. `update(id, dto, adminId, ip?)` unchanged.
- i18n: none (admin-facing API error, English-only like its siblings).

### Contract verification checklist (run before Gate 4)
- [x] Count predicate will contain `role='Admin'`, `banned_at IS NULL`, suspended-expiry, AND
  `deleted_at IS NULL` — verified by SQL tripwire spec after the change.
- [x] No other count/role query in this service lacks the ghost filter — checked
  (`list()` already has it since f40acd9; `findOne` is by-id).
- [x] No migration required (column exists since migration 0031).
- [x] No i18n keys needed.
- [x] Existing 4 pdpl-guard cases must stay green (guard doesn't shadow them).
