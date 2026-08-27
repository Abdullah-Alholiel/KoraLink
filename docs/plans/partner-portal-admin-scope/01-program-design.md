# Gates 1–3 (compact) — Admin partner-portal scope (P1-6) + markNoShow 500 fix

## Problem (user story)

As a **KoraLink admin** opening the partner portal (`/partner`), I expect to see and manage
**all** venues/pitches (support/moderation), consistent with `/partner/venues` and
`/partner/pitches` which already list all. Today `getDashboard` and `getEarnings` are always
owner-scoped (return empty for Admin) and `updatePitch` silently 404s for Admin. Also, a host
marking a **non-roster** player no-show throws a 500 instead of a clean 404.

## Scope

- **IN**: `updatePitch`, `getDashboard`, `getEarnings` accept `actorRole` and bypass ownership
  for `Admin` (mirroring `deletePitch`/`getVenues`/`getPitches`); controller passes
  `user.role`; unit specs. Plus the 2-line `markNoShow` null-guard reorder + spec.
- **OUT**: real payment/payout provider (P0-2, external); settlement race migration (P2-9,
  next run); frontend changes (admin pages are generic `useLiveAdminData` consumers — no UI
  change needed); push i18n (P2-8).

## Architecture delta (backend-only)

- `partner.service.ts`: rename `ownedVenueIds`/`ownedPitchIds` → `scopedVenueIds(ownerId, actorRole?)`
  / `scopedPitchIds(ownerId, actorRole?)` using `actorRole === 'Admin' ? sql\`true\` :
  eq(venues.owner_id, ownerId)` (same idiom as `getVenues:75` / `getPitches:277`).
  `getDashboard(ownerId, actorRole?)` scopes its `owned` venue SELECT the same way;
  `getEarnings(ownerId, actorRole?)` uses `scopedVenueIds`. `updatePitch(actorId, actorRole,
  pitchId, dto)` drops the inline owner-scoped SELECT and calls
  `assertPitchAccess(actorId, actorRole, pitchId)` (partner.service.ts:463) — 404 only when the
  pitch is genuinely missing, 403 for a non-owner non-admin (matches `deletePitch`).
- `partner.controller.ts`: `dashboard`, `updatePitch`, `earnings` read `role` off
  `@CurrentUser()` and forward it.
- `matches.service.ts` `markNoShow`: move `wasFlagged = player.no_show;` to AFTER the
  `if (!player) throw NotFoundException` guard.

## Contracts (unchanged JSON shapes)

- `GET /partner/dashboard` → same `{ venueNames, todayUtilization, upcomingMatches, revenueToday,
  nextMatchInMinutes, scheduleToday, recentDeposits }`; for Admin, aggregates span all venues.
- `GET /partner/earnings` → same `{ settlements, totalPending, totalPaid }`; Admin sees all.
- `PATCH /partner/pitches/:id` → returns `findOnePitch(pitchId)` (populated) — unchanged shape;
  Admin may now edit any pitch. Non-owner non-admin → 403 (was 404).
- `PATCH /matches/:id/attendance` (markNoShow) → unchanged; missing player now 404, not 500.

## TS signatures

```ts
// partner.service.ts
private scopedVenueIds(ownerId: string, actorRole?: string): Promise<string[]>
private scopedPitchIds(ownerId: string, actorRole?: string): Promise<string[]>
getDashboard(ownerId: string, actorRole?: string): Promise<PartnerDashboard>
getEarnings(ownerId: string, actorRole?: string): Promise<PartnerEarnings>
updatePitch(actorId: string, actorRole: string, pitchId: string, dto: UpdatePitchDto): Promise<Pitch>
```

## Contract verification checklist (Gate 3 → Gate 4)

- [x] `updatePitch` returns populated `findOnePitch(pitchId)` (not bare row) — unchanged.
- [x] `getDashboard`/`getEarnings` JSON shape unchanged — Admin only widens the row set.
- [x] Admin frontend (`useLiveAdminData` consumers) accepts unchanged shapes — no FE change.
- [x] No new user-facing strings → no i18n keys.
- [x] Non-owner non-admin `updatePitch` now 403 (Forbidden) — stricter, no data leak.

## Verification gates (each slice)

`npm run build` (root, 0 errors) · `npx vitest run -C apps/player-pwa` · `npx jest` (apps/api) ·
`npm run type-check` (PWA). API service restart after build writes `dist/`.
