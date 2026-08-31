# Gate 3 — Program Design (Contract Gate): Admin & Partner Console UX Overhaul

> Every shape below is copy-paste exact. Backend returns these; frontend consumes these.
> ID columns are varchar(36) — raw SQL casts `::text`, never `::uuid`.

## 1. API contracts (apps/api, all under `AdminAuthGuard`, prefix `/api/v1`)

### 1.1 `PATCH /admin/matches/:id` — NEW
Request `UpdateMatchAdminDto` (all optional, at least one required → 400 if none):
```json
{ "title": "Thursday night 8s", "match_type": "Competitive", "gender_rule": "Mixed",
  "scheduled_at": "2026-09-05T18:00:00.000Z", "duration_mins": 90 }
```
Validation: match.status ∈ {Open, InProgress} else 400 "Only Open or InProgress matches can be
edited."; `scheduled_at` must parse + be future when present; when scheduled_at/duration_mins
change → target window on the same pitch must be free of OTHER bookings (reuse P1-13 slot-free
check semantics — locks not required for a metadata path, single UPDATE with WHERE guard).
NO wallet/ledger operations.
Response 200 = `matchesService.findOne(id)` (existing rich relational shape: match row +
`host{id,full_name,avatar_url}` + `pitch{...}` + `players[...]`). Audit `match.update`.
Broadcast `matches`. Activity `match_updated_admin` → roster (best-effort).

### 1.2 `POST /admin/venues/:id/transfer-ownership` — NEW
Request: `{ "newOwnerId": "<user uuid 36>" }` (required).
Validation: venue exists (404); target user exists (404); target.role === 'VenueOwner' else
400 "Target user is not a venue owner."; target !== current owner else 400 "Already the owner."
Effect: `UPDATE venues SET owner_id = $newOwnerId, updated_at = now()` (withTimestamp).
Audit `venue.transfer_ownership` (before/after owner). Realtime `venues`.
Activities: old owner `venue_ownership_removed`, new owner `venue_ownership_added` —
**requires 2 new ActivityVerb enum values → idempotent migration 0028** (0026 precedent).
Response 200:
```json
{ "id": "…", "name": "KSU Stadium", "city": "Riyadh", "address": "…",
  "owner": { "id": "…", "full_name": "Saad", "phone": "+9665…" },
  "is_approved": true, "is_koralink_partner": true, "pitch_count": 3,
  "amenities": ["parking"], "open_hour": 8, "close_hour": 23,
  "closed_day_0": false, "…closed_day_6": false, "created_at": "…", "updated_at": "…" }
```

### 1.3 `GET /admin/pitches` — NEW
Query `ListPitchesDto`: `search?: string` (name/venue/owner ILIKE), `venueId?: string`,
`page = 1`, `perPage = 20` (≤100).
Response 200:
```json
{ "pitches": [ { "id": "…", "name": "Pitch A", "size": "5v5",
    "surface_type": "Artificial", "environment": "Outdoor",
    "hourly_rate": 300.0, "is_active": true,
    "venue": { "id": "…", "name": "KSU Stadium", "city": "Riyadh" },
    "owner": { "id": "…", "full_name": "Saad", "phone": "+9665…" },
    "slots_total": 240, "slots_booked": 57, "created_at": "…" } ],
  "total": 12, "page": 1, "perPage": 20 }
```
(`slots_total` = all future slots; `slots_booked` = future booked. `owner` nullable when venue
owner deleted — LEFT JOIN.)

### 1.4 `PATCH /admin/pitches/:id` — NEW
Request `UpdatePitchAdminDto` = partner's UpdatePitchDto fields **plus**:
```json
{ "venue_id": "…", "is_active": false }
```
Validation: if `venue_id` present → target venue exists (404). All other validations mirror
partner UpdatePitchDto. Effect: single UPDATE (withTimestamp). Audit `pitch.update` (before/after,
includes venue move + is_active). Realtime `venues`. NO notifications (admin metadata fix).
Response 200 = same pitch row shape as 1.3 (owner resolved from NEW venue).

### 1.5 `POST /admin/disputes/:id/reopen` — NEW
Request: empty body. Precondition: status ∈ {resolved, rejected} else 400 "Only decided disputes
can be reopened." Effect: `status → 'opened'`, evidence JSON append
`{"action":"reopened","by":"<adminId>","at":"<ISO>"}` (single UPDATE, jsonb concat). Decision and
internal_note are PRESERVED (visible history). Audit `dispute.reopen`. Broadcast `disputes`.
NO player notification in v1 (documented decision — audit trail is the record).
Response 200 = `findOne(id)` shape (dispute + reporter/respondent/match + messages[]) with
`status: "opened"`.

### 1.6 `PATCH /admin/disputes/:id` — NEW
Request `UpdateDisputeDto`: `{ "decision?: string", "internalNote?: string" }` (≥1 required).
Allowed in ANY status (post-decision edits are the point). Audit `dispute.update`.
Response 200 = `findOne(id)` shape.

### 1.7 `POST /admin/reports/:id/reopen` — NEW
Empty body; status ∈ {resolved, dismissed} else 400. `status → 'open'`, clears
`resolved_by`/`resolved_at` (fresh queue entry), PRESERVES `resolution` text.
Audit `report.reopen`. Response 200 = report detail shape (existing `AdminReportDetail`).

### 1.8 `PATCH /admin/reports/:id` — NEW
`{ "resolution?: string" }`. Any status. Audit `report.update`. Response = report detail shape.

### 1.9 `GET /partner/dashboard` — EXTENDED (backward-compatible)
Existing fields unchanged. ADDED:
```json
{ …existing,
  "venueCount": 2, "pitchCount": 5,
  "upcomingList": [ { "id": "…", "title": "…", "pitchName": "Pitch A",
      "scheduledAt": "2026-09-01T18:00:00.000Z", "playersFilled": 7, "maxPlayers": 10 } ],
  "weeklyTrend": [ { "date": "2026-08-25", "bookedSlots": 12, "revenue": 3600.0 } ] }
```
`upcomingList` = next 5 upcoming (UPCOMING_STATUSES, scheduled_at ≥ now, asc).
`weeklyTrend` = 7 entries, oldest→today, `revenue` = sum(pitch_cost_sar) per Riyadh day,
`bookedSlots` = booked pitch_slots per day.

## 2. Frontend contracts (apps/admin)

### 2.1 RBAC (`lib/rbac.ts`) — exact final state
```ts
SECTION_BY_ROLE.Admin = ['dashboard','users','matches','venues','pitches','disputes',
  'reports','transactions','settlements','settings','audit'];        // partner.* REMOVED
SECTION_BY_ROLE.VenueOwner = [/* unchanged 6 partner.* */];
// ConsoleSection adds: 'pitches'
// ConsoleAction adds: 'match.edit' | 'venue.transfer' | 'pitch.transfer'
//                     | 'dispute.reopen' | 'report.reopen'   (all Admin-only)
```
`sectionForPath('/pitches/…')` → 'pitches'.

### 2.2 Shell (RTL)
- `layout.tsx`: `<main className="ps-64">` (was pl-64); sidebar `fixed inset-y-0 start-0`.
- Root `layout.tsx` boot script unchanged (already flips dir pre-paint). Verify
  AdminI18nProvider calls `applyDocumentLocale` on every locale change.
- Grep gate (must be 0 hits after slice 1 on these paths):
  `grep -rnE 'left-0|pl-64|text-left|text-right|mr-|ml-' apps/admin/src/components/Sidebar.tsx apps/admin/src/app/\(dashboard\)/layout.tsx`

### 2.3 New shared components
```tsx
Drawer({ open: boolean; onClose: () => void; title: string; subtitle?: string;
         size?: 'md' | 'lg'; children; footer?: ReactNode })   // end-0 slide-over, Esc+backdrop+X
FormField({ label: string; error?: string | null; hint?: string; required?: boolean;
            children })                                      // label above input
ConfirmDialog({ open; title; message; confirmLabel; cancelLabel; danger?;
                onConfirm: () => void; onClose })             // replaces window.confirm/alert
useToast() → { success: (msg: string) => void; error: (msg: string) => void }
// <ToastHost/> mounted once in (dashboard)/layout.tsx; portal, auto-dismiss 4s, RTL-safe (end-4)
```

### 2.4 Page wiring
- `/pitches` (NEW): `useLiveAdminData<AdminPitchesResponse>('/admin/pitches?'+qs, ['venues'])`;
  search input (debounced 300ms, resets page); row actions: Edit → PitchFormDrawer(mode=edit,
  admin=true → adds venue select + is_active toggle); Transfer/move via same drawer's venue select
  + ConfirmDialog.
- `/matches`: row kebab → Edit (MatchEditDrawer: title input, type/gender selects, date+time+
  duration; submit → `api.patch('/admin/matches/'+id, values)` → toast + reload) · Cancel (existing,
  wrapped in ConfirmDialog).
- `/disputes/[id]`: fully localized via `useTranslations('adminDisputes')`; when closed →
  buttons **Reopen** (`api.post(…/reopen)` + ConfirmDialog) and **Edit outcome** (inline textareas
  prefilled → `api.patch(…)`); evidence timeline renders `reopened` entries (i18n label).
- `/reports/[id]`: same via `adminReports`.
- `/partner`: existing 4 MetricCards + new sections: Upcoming list (5 rows → link
  `/partner/matches/:id`), 7-day trend (recharts ComposedChart, bars=bookedSlots, line=revenue,
  `next/dynamic` ssr:false), quick actions row (Add pitch → PitchFormDrawer, Manage schedule →
  jumps to /partner/pitches with slide-over open via `?schedule=<pitchId>` query param).
- `/partner/venues`: create + edit inside `VenueFormDrawer` (FormField grid: name, city, address,
  amenities (comma input + rendered chips preview), hours selects, closed-day toggles); existing
  client validation P2-31(1) moves inside drawer save handler; Toast on save.
- `/partner/pitches`: header button "Add pitch" → `PitchFormDrawer(mode=create)`; per-card:
  Manage schedule → `ScheduleDrawer` (Drawer lg wrapping existing SlotManager internals — SlotManager
  stays the content component, gains `variant="drawer"`), Edit → PitchFormDrawer(mode=edit),
  toggle availability, delete → ConfirmDialog. Page content NEVER shifts (no inline panels).
- `EditPitchSheet.tsx` DELETED (replaced by PitchFormDrawer).

### 2.5 i18n key contract (both en.json & ar.json — exact)
```
nav.pitches
common: cancel, close, save, saveChanges, saving, retry, confirm, search, actions, optional
drawer: closeAria
confirm: confirmTitle, cancelLabel
toast: saved, failed
matchEdit: title, editTitle, fldTitle, fldType, fldGender, fldDate, fldTime, fldDuration,
           saved, failed, forbiddenStatus
adminPitches: title, subtitle, searchPh, thPitch, thVenue, thOwner, thRate, thSize, thStatus,
              thSlots, empty, loading, error, transferTitle, moveToVenue, editTitle,
              ownerNone, saved, failed, deleteConfirm
adminDisputes: title, backToList, loading, loadFailed, caseDetails, reporter, respondent, match,
               status, policyRef, decision, internalNote, timeline, noEvidence, reopened,
               followUps, decisionPanel, closedAs, resolveBtn, rejectBtn, decisionPh, notePh,
               submit, reopen, reopenConfirmTitle, reopenConfirmMsg, editOutcome, saved, failed
adminReports: title, backToList, loading, loadFailed, caseDetails, reporter, status, subject,
              reason, resolution, resolvedBy, resolvedAt, decisionPanel, closedAs, resolveBtn,
              dismissBtn, resolutionPh, banSubject, submit, reopen, reopenConfirmTitle,
              reopenConfirmMsg, editOutcome, saved, failed
partner.dashboard2: upcomingTitle, upcomingEmpty, trendTitle, trendBooked, trendRevenue,
                    quickActions, addPitch, manageSchedules, venuesCount, pitchesCount
venueForm: createTitle, editTitle, fldName, fldCity, fldAddress, fldAmenities, fldAmenitiesHint,
           fldOpenHour, fldCloseHour, fldClosedDays, closedDay0…closedDay6 (existing keys reused),
           hoursInvalid (existing), submitCreate, submitEdit, saved, failed
pitchForm: createTitle, editTitle, fldVenue, fldName, fldSize, fldSurface, fldEnvironment,
           fldRate, fldActive, ratePreview, submitCreate, submitEdit, saved, failed,
           venueRequired, nameRequired
schedule: manageTitle, closeAria
```
Parity gate: `en` keys count === `ar` keys count, diff printed in slice verification.

## 3. Contract verification checklist (to re-run verbatim before Gate 4 build)
- [ ] Every NEW mutation returns the populated object named above (no bare rows, no `{message}`) — §1.1–1.8
- [ ] 1.2/1.4 return owner-resolved venue/pitch rows (not pre-transfer stale data)
- [ ] 1.5/1.7 preserve history fields (dispute decision text / report resolution text)
- [ ] FE types (`lib/types.ts`) extended to accept exact §1 shapes (AdminPitchRow, PartnerDashboard +)
- [ ] Every user-facing string above has en + ar entries (§2.5 parity gate)
- [ ] ActivityVerb migration 0028 idempotent (0026 pattern) BEFORE activities.record uses new verbs
- [ ] No `::uuid` casts in new raw SQL (varchar(36) → `::text`)
- [ ] Audit entries written for every new mutation; realtime broadcastOps where listed
- [ ] Grep gate §2.2 returns 0 hits post-slice-1

## 4. Vertical slice order (Gate 4 plan; every slice → tsc + turbo build green → commit)
1. **Shell & RBAC (tracer bullet):** rbac.ts, Sidebar, layout ps-64/start-0, i18n nav.pitches +
   common additions, AdminI18nProvider dir check. E2E visible: admin login → 11 HQ tabs only; ar →
   mirrored shell.
2. **Admin Pitches:** API 1.3+1.4 (+audit) + `/pitches` page + PitchFormDrawer(admin mode).
3. **Match edit:** API 1.1 + MatchEditDrawer on /matches.
4. **Ownership transfer:** migration 0028 + API 1.2 + venue transfer UI (user picker w/ role
   filter + ConfirmDialog) + notifications + pitch venue-move via 1.4 (slice 2 UI already supports).
5. **Disputes & reports lifecycle:** API 1.5–1.8 + both detail pages localized + reopen/edit UI.
6. **Partner dashboard:** API 1.9 + dashboard sections (upcoming, trend chart, quick actions).
7. **Partner forms & schedule slide-over:** VenueFormDrawer, PitchFormDrawer(partner), ScheduleDrawer;
   delete EditPitchSheet; window.confirm/alert replaced.
8. **Sweep & harden:** full i18n parity, RTL grep gates, all 5 UX states on touched screens,
   `turbo run build` + `tsc --noEmit` (api) + admin type-check, push, board/STATE update.
