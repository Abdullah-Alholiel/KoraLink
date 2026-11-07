# Run #113 — Program design (compact: Gates 1-3)

Single doc per autonomous-mode convention. Cycle = Venue module sweep (API lane).

## Problem
(1) A venue whose owner user row is missing silently vanishes from venue browse AND from a
user's saved-favorites list, while `GET /venues/favorites/ids` (no users join) still returns
the id → ghost heart, empty list (P2-167, boarded run #112 from Reviewer-A A-3).
(2) The player-facing `venues` controller routes three `:id` params raw — the P2-164
UuidParamPipe class stopped at admin/partner controllers (Reviewer A API-VEN-001, this run).
(3) `GET /venues?city=` is unbounded (`@IsString`, no max) while sibling `search` is capped
at 80 (Reviewer A API-VEN-002).

## User story
As a player, a club I favorited never disappears from my favorites list just because an owner
account was cleaned up; malformed ids get a clean 400 instead of reaching the DB layer.

## Scope
IN: venues.service.ts (2 queries), venues.controller.ts (3 params), get-venues.dto.ts (1 field),
1 new spec, 1 DTO-caps spec rider. OUT: schema, migrations, PWA/admin, other controllers.

## Contract (unchanged shapes — render-only SQL fix)
- `GET /venues` → bare `NearbyVenueRow[]` (BARE array — count with Array.isArray; runbook
  E2E trap). `owner_name` becomes `''` (was: row dropped) only in the owner-missing edge.
- `GET /venues/favorites` → bare array, same row shape, same COALESCE edge.
- `POST|DELETE /venues/:id/favorite`, `GET /venues/:id` → malformed id now **400** with
  UUID_SHAPE_MSG (was: raw string into DB lookup → 404-ish behavior). Known callers send
  uuid-shaped ids (venue ids are varchar(36) uuids from every list response) — no legit
  caller can send a malformed id.
- i18n: none (no user-facing copy changes).

## Architecture delta
Zero new modules/tables. SQL join-strength + one DTO cap + pipe bindings. `GROUP BY v.id, u.id`
stays valid under LEFT JOIN (NULL owner = one group per venue; many-to-one, no row
multiplicity change; no pagination/count queries exist on either surface — verified by
Reviewer A).

## Verification checklist (Gate 3)
- [x] No mutation endpoint touched (read-only SQL + param validation) → contract §2 N/A.
- [x] Row shape unchanged (`owner_name` still a string; NULL → '').
- [x] Adapter/types: PWA `VenueApi` types `owner_name: string` — COALESCE keeps it string.
- [x] i18n: no new keys (verified no copy added).
- [x] Spec pins BOTH queries jointly + GROUP BY + COUNT aggregate (venues.owner-join.spec.ts).

## i18n keys
None added.
