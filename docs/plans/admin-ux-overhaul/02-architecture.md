# Gate 2 — Architecture: Admin & Partner Console UX Overhaul

## Overview

```
┌─────────────────────────── apps/admin (Next 15, :3002) ───────────────────────────┐
│ layout.tsx (dir-aware shell)   Sidebar (start-0/inset-inline)   rbac.ts (RBAC SoT) │
│                                                                                     │
│ HQ: /dashboard /users /matches /venues /pitches(NEW) /disputes /reports             │
│     /transactions /settlements /settings /audit                                     │
│ Partner: /partner (rich dashboard) /venues (drawer edit) /pitches (drawer+slideover)│
│ Shared components: Drawer(NEW) FormField(NEW) ConfirmDialog(NEW) Toast(NEW)         │
└─────────────────────────────────────────────────────────────────────────────────────┘
        │ Bearer JWT (role claim)                          ▲ admin-only endpoints 403
        ▼                                                  │ others
┌─────────────────────────── apps/api (NestJS) ──────────────────────────────────────┐
│ modules/admin:  matches.controller  +PATCH :id (NEW)                                │
│                 venues.controller   +POST :id/transfer-ownership (NEW)              │
│                 pitches.controller  (NEW module file: list + transfer)              │
│                 disputes.controller +POST :id/reopen, +PATCH :id (NEW)              │
│                 reports.controller  +POST :id/reopen, +PATCH :id (NEW)              │
│ modules/partner: getDashboard() extended (upcoming list, 7-day trend, quick links)  │
└─────────────────────────────────────────────────────────────────────────────────────┘
        │
        ▼ PostgreSQL (koralink) — NO schema change required (enums already cover
          reopen targets: DisputeStatus.opened, ReportStatus.open; ownership is
          venues.owner_id / nothing — pitches inherit venue ownership)
```

### Pitch ownership note (from schema)
`pitches` has **no owner_id** — ownership flows `venues.owner_id → venue → pitches`. Therefore
"pitch owner transfer" is either (a) transfer the parent venue, or (b) move the pitch to a
different venue. Both are covered: **venue ownership transfer** (A4) + **pitch venue move**
(admin pitch edit: change `venue_id` within the same owner's venues or any venue — admin power).
This matches the schema instead of inventing a column.

## Component changes

### apps/api
| File | Change |
|------|--------|
| `modules/admin/matches.service.ts` + controller + `dto/update-match.dto.ts` | NEW `PATCH /admin/matches/:id` — title, match_type, gender_rule, scheduled_at, duration_mins (guards: status ∈ {Open, InProgress}; future scheduled_at; slot availability when schedule moves — reuse P1-13 slot-free check, NO money movement) |
| `modules/admin/venues.service.ts` + controller + `dto/transfer-venue.dto.ts` | NEW `POST /admin/venues/:id/transfer-ownership` — `{ newOwnerPhone or newOwnerId }`; validates target is VenueOwner (upgrades role if Player? NO — must already be VenueOwner); audit `venue.transfer_ownership`; activity notify old+new owner |
| `modules/admin/pitches.controller.ts` + `pitches.service.ts` (NEW) | `GET /admin/pitches` (list w/ venue, owner, slot counts, search+paginate) · `PATCH /admin/pitches/:id` (name, size, surface_type, environment, hourly_rate, is_active, venue_id move) — audit each |
| `modules/admin/disputes.service.ts` + controller | NEW `POST /admin/disputes/:id/reopen` (status → opened, keep decision as `previous_decision`? NO schema change → decision preserved, append evidence entry `{action:'reopened', by, at}` to evidence json) · NEW `PATCH /admin/disputes/:id` (decision, internal_note — allowed when resolved/rejected too) |
| `modules/admin/reports.service.ts` + controller | NEW `POST /admin/reports/:id/reopen` (status → open) · NEW `PATCH /admin/reports/:id` (resolution text) |
| `modules/partner/partner.service.ts` | `getDashboard()` + upcomingMatchesList (next 5: title/pitch/time), weeklyTrend (7-day booked-slot or revenue series), venueCount, pitchCount, pendingVerification flag |

### apps/admin
| File | Change |
|------|--------|
| `lib/rbac.ts` | Admin loses ALL `partner.*` sections (F1); gains `pitches`; new actions `match.edit`, `pitch.transfer`, `venue.transfer`, `dispute.reopen`, `report.reopen` |
| `components/Sidebar.tsx` | `fixed inset-y-0 start-0` (RTL mirror); remove partner-group rendering; add pitches icon |
| `app/(dashboard)/layout.tsx` | `pl-64` → `ps-64`; `<main dir>`-safe; content wrapper `text-start` |
| `components/Drawer.tsx` (NEW) | RTL-aware slide-over (fixed `inset-y-0 end-0`, w-full max-w-xl, Esc+backdrop+X close, focus trap, animate) — used by venue edit, pitch edit, schedule manager, admin forms |
| `components/FormField.tsx` (NEW) | label-above-input + error text + hint; kills placeholder-only pattern |
| `components/ConfirmDialog.tsx` (NEW) | replaces `window.confirm` (delete, transfer, reopen) |
| `components/Toast.tsx` (NEW) | success/error feedback after mutations (replaces alert()/silent reload) |
| `app/(dashboard)/pitches/page.tsx` (NEW) | Admin pitch list: table w/ search (name/venue/owner), venue + owner column, status, rate; Edit drawer (admin PATCH), transfer/move venue action |
| `app/(dashboard)/matches/page.tsx` | Row action: Edit (drawer: title, type, gender, schedule+duration w/ slot validation), Cancel (existing) |
| `app/(dashboard)/disputes/[id]/page.tsx` | Full i18n; Decision panel never dead-ends: when closed → Reopen + Edit outcome buttons; evidence timeline shows reopen entries; ConfirmDialog for reopen |
| `app/(dashboard)/reports/[id]/page.tsx` | Same treatment as disputes |
| `app/(dashboard)/partner/page.tsx` | Rich dashboard: metrics row (existing 4) + upcoming matches list (5) + 7-day trend mini bar chart (recharts, pre-aggregated) + quick actions (add pitch → modal/drawer, open schedule) |
| `app/(dashboard)/partner/venues/page.tsx` | Edit → Drawer with FormField grid (name, city, address, amenities chips→comma, hours selects, closed days) + validation + Toast; create form → Drawer too |
| `app/(dashboard)/partner/pitches/page.tsx` | Add pitch → Drawer form (labeled, validation, live price preview row, review) ; card grid stays but actions: Manage schedule (slide-over), Edit (drawer), toggle, delete (confirm) |
| `components/SlotManager.tsx` | Wrapped in Drawer (slide-over) via new `ScheduleDrawer.tsx` — pitch context header, week grid + generator + add-slot inside; page never shifts |
| `components/EditPitchSheet.tsx` | Replaced by `PitchFormDrawer.tsx` (shared by create + edit via `pitch?: PartnerPitch` prop) |
| `messages/en.json` `messages/ar.json` | +~70 keys each: nav.pitches, admin forms, drawer/confirm/toast common, disputes/reports detail, partner dashboard extras |
| `src/i18n/AdminI18nProvider.tsx` | ensure `document.documentElement.dir` set on locale change (verify existing; boot script handles first paint) |

## Data flow (admin owner transfer — highest risk)
```
Admin UI (Drawer: pick user by phone search) 
  → POST /admin/venues/:id/transfer-ownership {newOwnerId}
  → AdminAuthGuard (role=Admin) → validate: venue exists, newOwner exists & role=VenueOwner
  → tx: UPDATE venues SET owner_id=newOwner (withTimestamp)
  → audit.log('venue.transfer_ownership', before/after)
  → activities.record ×2 (old owner: venue_removed, new owner: venue_added)
  → realtime.broadcastOps('venues')
  → 200 populated venue row → Toast success → list reload
```

## i18n keys (both languages) — groups added
`nav.pitches` · `common.*` (saving/saved/cancel/close/retry/confirm) · `drawer.closeAria` ·
`confirm.{title,cancel,confirm}` · `toast.{saved,failed}` · `adminMatches.edit*` ·
`adminPitches.*` (title, search, owner, transfer, moveToVenue…) · `adminDisputes.*` (full page) ·
`adminReports.*` (full page) · `partner.dashboard2.*` (upcoming, trend, quickActions…) ·
`venueForm.*` `pitchForm.*` (labels, validation, preview) · `schedule.*` (drawer title, close)

## What is descoped
- Venue creation geolocation picker (address text stays) — partner provides address; geo still set
  by API city fallback as today.
- Reopen-with-reason evidence prompt: reopen appends a system evidence entry automatically
  (`reopened by admin`), no mandatory reason dialog (one click, admin is trusted).
- Bulk actions on lists.

## Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| Admin match reschedule breaks money/slots | Reuse P1-13 availability check only; NO wallet/ledger code in admin path; forbid Completed/Cancelled |
| Transfer to non-owner role | API validates role=VenueOwner, 422 otherwise; UI pre-filters user search to VenueOwners |
| RTL sweep regressions | Mechanical grep gate on touched files + visual check in both locales at slice end |
| i18n key drift | Enforce: every `t('...')` grep'd against both JSONs in slice verification; parity count printed |
| recharts bundle on partner dashboard | Already a dependency (admin metrics page uses it); lazy-load chart section via next/dynamic |
