# Run #94 — Program Design: Admin DTO/query-param validation hardening (P2-136 + P2-137)

## Problem
Reviewer A (run #94, admin-lane rotation) found two IMPORTANT validation gaps in the admin/partner API surface:
1. **P2-136** — admin mutation DTOs accept unbounded/unshaped strings that flow into SQL binds and DB writes: `transfer-venue.dto.ts` newOwnerId (no UUID-shape/@MaxLength(36)), `update-pitch-admin.dto.ts` venue_id (bare @IsString), `list-pitches.dto.ts` venueId (bare, interpolated into raw SQL WHERE), `resolve-dispute.dto.ts` decision/internalNote (unbounded free text persisted), `list-venues.dto.ts` search/city (unbounded ILIKE inputs).
2. **P2-137** — `GET /admin/pitches/:id/slots` and `GET /partner/pitches/:id/slots` take raw `@Query('from')/@Query('to')` strings into drizzle `gte/lte` on `slot_date`. Garbage values → PG comparison error (500); reversed range → silent empty result. Partner-side creation already regex-validates dates (`slots.dto.ts` `^\d{4}-\d{2}-\d{2}$`) — the list side is the gap.

Not an injection: drizzle `sql` templates bind parameters; `gte/lte` are parameterized. This is correctness + error-hygiene hardening (400 vs 500, bounded writes), not a security hole.

## User story
As an admin console operator, a malformed filter or paste-error in a form should produce a clear 400 validation error — never a 500, never an unbounded write into the audit/dispute records.

## Scope
IN: the 5 DTO files + a new shared `SlotWindowQueryDto` + controller wiring on BOTH slot-list routes + tests (behavioral + source-pinning tripwire in the house dto-caps style).
OUT: admin console UI changes (none needed — `lib/week.ts` already emits YYYY-MM-DD), DB changes, migrations, i18n (API 400 messages only, no user-facing copy), PWA.

## Contract (exact)
- `TransferVenueDto.newOwnerId`: `@IsString() @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) @MaxLength(36)` (CastVoteDto/MarkNoShowDto convention — shape, not @IsUUID, because all id columns are varchar(36)).
- `UpdatePitchAdminDto.venue_id`: same UUID-shape + @MaxLength(36), @IsOptional preserved.
- `ListPitchesDto.venueId`: same, @IsOptional preserved.
- `ResolveDisputeDto.decision`: + `@MaxLength(1000)`; `internalNote`: + `@MaxLength(1000)` (matches VenueDecisionDto.note cap — same audit-payload class).
- `ListVenuesDto.search`: + `@MaxLength(255)`; `city`: + `@MaxLength(100)` (create-venue.dto convention).
- NEW `apps/api/src/modules/partner/dto/slot-window.dto.ts`: `SlotWindowQueryDto { from: string; to: string }` — both `@IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)`, plus `@Validate` cross-field check `from <= to` (message: 'from must be on or before to'). Controllers switch `@Query('from'), @Query('to')` → `@Query() dto: SlotWindowQueryDto`; call sites pass `dto.from, dto.to`.
- Global ValidationPipe (whitelist+forbidNonWhitelisted+transform) returns 400 with the message — no service-layer changes needed.

## TS signatures (changed)
```ts
// pitches.controller.ts (admin) — before: listSlots(id, from: string, to: string, adminId)
listSlots(@Param('id') id: string, @Query() window: SlotWindowQueryDto, @Req() req: Request)
  → this.pitches.listSlots(id, window.from, window.to, adminId)
// partner.controller.ts — same shape, partner service call unchanged otherwise
```

## Tests (jest, house dto-caps pattern)
- `apps/api/src/modules/admin/dto-caps.spec.ts` (NEW, extends the run-#73 harness style): behavioral validateSync cases for all 5 DTOs (valid passes; 37-char / non-UUID-shaped id rejected; 1001-char dispute text rejected; 256-char search rejected) + source-pin assertions (`@MaxLength(36)` present in transfer-venue/update-pitch-admin/list-pitches sources, `@MaxLength(1000)` in resolve-dispute).
- `apps/api/src/modules/partner/slot-window.dto.spec.ts` (NEW): valid window passes; garbage date rejected; reversed range rejected by the cross-field check; `to` before epoch-adjacent dates OK (regex only, no range semantics).

## Gate-3 checklist
- [x] No mutation return-shape changes (validation only; service bodies untouched).
- [x] Frontend unaffected: admin console already sends YYYY-MM-DD (`toLocalDateKey`), venue ids are real 36-char ids from the API; a hand-edited bad value now gets a 400 instead of a 500/empty grid — better error UX, no contract break.
- [x] Both routes sharing the DTO stay in lockstep (single source of truth).
- [x] i18n: no user-facing copy added.
- [x] Observability: no new paths; existing Pino/Sentry capture unchanged.

## Vertical slices
1. DTO caps (P2-136) + dto-caps.spec → jest green → commit.
2. SlotWindowQueryDto (P2-137) + both controllers + spec → jest green → commit.
3. Full gates: `npx turbo run build --concurrency=1` + full jest + api tsc → PR flow (branch → push → gh pr create --base staging → bot checks → squash-merge).
