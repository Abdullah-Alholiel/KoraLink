# Run #19 — Program Design (Gates 1–3 compact)

Covers three vertical slices. One cycle doc per run per convention; this is the contract sheet for all three.

## Item 1 — P1-33: fold orphan migration into the chain (data integrity)

**Problem.** `drizzle/0014_admin_notification_verbs.sql` is on disk but absent from
`drizzle/meta/_journal.json`. Live DB already has the 4 verb values (out-of-band run #14), but a
fresh environment (`drizzle migrate` from zero) skips the file → enum insert 500s in dispute-resolve,
refund, admin-cancel flows.

**Decision.** Never edit the applied orphan; never edit `_journal.json` by hand. `drizzle-kit generate`
against the current schema + live-DB state should emit a small idempotent `ALTER TYPE ... ADD VALUE IF
NOT EXISTS` migration for exactly the values missing from the snapshot chain (0026). Hand-adjust the
generated SQL ONLY if drizzle emits `ADD VALUE` without `IF NOT EXISTS` (idempotency is required — the
live DB already has the values; plain ADD VALUE would fail re-apply). If generate refuses (no diff),
fallback: `drizzle-kit migrate:custom`? No — hand-write migration file + register it in the journal via
`drizzle-kit generate --custom` (supported) so bookkeeping stays drizzle-owned.

**Contract.**
- New migration file `0026_<slug>.sql`: 4 × `ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS '<verb>';`
- Journal entry appended (idx 26). Snapshot (if generated) reflects current schema.
- `npm run db:migrate` on the live box succeeds as a no-op (values present).
- Verify: `SELECT enum_range(NULL::"ActivityVerb")` unchanged (8+ values, none duplicated);
  `__drizzle_migrations` row count +1.

**Out of scope:** deleting the orphan file (keep as historical record; add header comment pointing to 0026? — no, do NOT edit the orphan at all; the run report documents the relationship).

## Item 2 — P1-34: exclude Cancelled from partner "upcoming" default (broken ops view)

**Problem.** `getPartnerMatches` statusFilter defaults `sql\`true\``; scope=upcoming lists Cancelled
matches as if they're upcoming (live evidence: 2 rows). Today-recap design intent ("ops surface shows
everything today") is preserved; upcoming is a forward-looking view — dead matches are noise.

**Contract.**
- `statusFilter` becomes: explicit `?status=` wins (unchanged); else if `scope === 'upcoming'`:
  `status <> 'Cancelled'`; else `sql\`true\`` (today recap unchanged).
- Additive only — no change to timeScope, scopeFilter, joins, pager, or the WHERE order.
- jest: 2 new cases in the partner matches spec — upcoming excludes Cancelled by default; explicit
  `?status=Cancelled` still returns cancelled rows.
- Live probe (post-restart): scope=upcoming default → 0 Cancelled rows; ?status=Cancelled → they return.

**API shape unchanged** (same envelope `{matches,total,hasMore}`, same row fields) — admin UI needs
no change; the row type already carries `status`.

## Item 3 — P1-32: PWA club detail page (missing feature)

**Problem.** `(main)/clubs/` lists venues; tapping one goes nowhere — no detail route. The API already
exposes `GET /venues/:id` (public, includes operating hours) and `GET /venues/:id/matches` may exist —
CHECK during implementation; if absent, slice 1 ships without the venue-matches section (it's already
reachable via the feed's venue filter) and the section is a fast-follow.

**User story.** As a player browsing clubs, I tap a club and see its photo, name, city/address,
open-hours status, pitch list (size/surface/type), and an upcoming-matches-at-this-venue section with a
Join affordance, in AR and EN, inside the standard (main) shell.

**Architecture delta (render-only feature — no backend change expected).**
- New route `apps/player-pwa/src/app/[locale]/(main)/clubs/[id]/page.tsx` — renders INSIDE the (main)
  shell (layout provides MobileFrame/BottomNav; page must NOT render its own).
- Hook `useVenue(id)` in `apps/player-pwa/src/hooks/useVenues.ts` (extends existing venue hooks — check
  actual file layout first) → `GET /venues/:id`; react-query, 5-min staleTime pattern matching sibling hooks.
- Adapter: reuse/extend the existing venue adapter (clubs list already adapts venue rows — extend, don't fork).
- Components: reuse `MatchCard` + `MatchDateSections` for the venue-matches section (they need
  `currentUserId` from `useAppStore(selectUser)` — pitfall), `VenueHoursStatus` logic reused from
  clubs list (`isVenueOpenNow`), plain rendered pitch list (no new component unless it grows >80 lines).
- Design: `koralink-ui-standards` — 5 UX states (loading skeleton, error w/ retry, empty, offline
  banner consistent with feed, success), `back` affordance, Tailwind tokens, no hardcoded colors.
- i18n keys (en + ar, parity-checked): `clubDetail.*` — title/back, address, hours open/closed,
  pitches, pitchSize/surface/type labels reuse existing keys where present, upcomingMatches,
  emptyMatches, join CTA reuse `match.join`. Deterministic date rendering (no `Date.now()` in render —
  use the shared Riyadh formatters; hydrate-open-state in useEffect, not render).

**Exact API JSON (from venues.service findOne — re-read at implementation):**
```json
{ "id": "…36", "name": "…", "city": "…", "address": "…", "description": "…",
  "photo_url": "…|null", "lat": 24.7, "lng": 46.6, "open_hour": 8, "close_hour": 23,
  "verification_status": "approved", "pitches": [ { "id", "name", "sport_type", "surface_type", "size" } ] }
```
(Verify field names against the actual service/adapter before coding — contract checkpoint, not memory.)

**5 UX states:** loading = skeleton cards; error = message + retry button; empty = N/A (venue always has
≥1 pitch); offline = existing banner pattern; success = full layout.

**Observability:** page renders under existing Sentry browser SDK; `captureError` on fetch failure via
the hook's onError (matches AGENTS.md §4 pattern used in sibling hooks).

## Gate 3 contract verification checklist
- [x] No mutation endpoints touched — §2 mutation contract N/A this cycle.
- [x] `GET /venues/:id` shape re-verified against source before the hook is written (checkpoint during Gate 4, not memory).
- [x] Adapter: extend existing venue adapter; no new sparse shape.
- [x] No field silently undefined: hook return type mirrors adapter output; page renders only adapted fields.
- [x] i18n: every new user-facing string exists in BOTH en.json and ar.json (parity script run before commit).
- [x] No new columns/tables → no db:generate for item 3; item 1's migration is enum-values-only.
- [x] `(main)/clubs/[id]` renders no MobileFrame/BottomNav of its own.
- [x] MatchDateSections/MatchCard receive `currentUserId`.
- [x] Z-index: any sheet on this page uses z-[60]/z-[70] convention (only if a sheet is added).

## Risks
- drizzle-kit generate may want to emit unrelated diffs if drift exists — inspect generated SQL; abort if
  anything beyond the 4 ADD VALUEs appears (investigate before proceeding, don't blind-apply).
- SW caching on the new route: default SW runtime caching already covers navigation routes; no change.
- Venue-matches section: if `GET /venues/:id/matches` doesn't exist, ship slices 1–2 (detail + pitches +
  hours) and leave the section out — fast-follow card on the board (P2), NOT a half-built section.
