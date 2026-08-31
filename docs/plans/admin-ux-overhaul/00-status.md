# Cycle Status — Admin & Partner Console UX Overhaul

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | auto (compact docs) | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | auto (compact docs) | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | auto (compact docs) | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED | Abdullah 2026-08-31 (all 4 defaults) | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ DONE | — | 8 slices, all pushed to main |

## Slice log (all `turbo run build` green + live-probed where API-touching)

| Slice | Commit | What landed | Live verification |
|-------|--------|-------------|-------------------|
| 1 | `26a0179` | HQ-only sidebar (admin loses partner tabs, gains Pitches), RTL-native shell (`start-0`/`ps-64`), i18n +120 keys | build 3/3 |
| RBAC-api | `c6e329a` | Partner controller `@Roles('VenueOwner')` — admin tokens 403 on /partner/* | probe: 403 ✓ |
| 2 | `846820a` | `GET/PATCH /admin/pitches` (search, owner, slots), /pitches page, Drawer/FormField/PitchFormDrawer | list 200, search 200, PATCH round-trip 200 |
| 3 | `9490354` | `PATCH /admin/matches/:id` (metadata + self-mode schedule w/ overlap guard) + MatchEditDrawer | rename 200/revert, completed 400, koralink-schedule 400, audit written |
| 4 | `89c009c` | `POST /admin/venues/:id/transfer-ownership` + migration 0028 + VenueTransferDrawer + ConfirmDialog | promote→transfer 201→owner swap→negatives 400→restore, notifications recorded |
| 5 | `a4cf5da` | dispute/report reopen + update endpoints; both detail pages fully localized w/ reopen+edit UI | edit 200, reopen 201 + evidence entry, 400s, state restored from audit |
| 6 | `9645e95` | Partner dashboard: counts, upcoming list, 7-day trend (server-aggregated), quick actions | owner login 200, counts/trend real data |
| 7 | `a01b1c4` | VenueFormDrawer, PitchFormDrawer rework, ScheduleDrawer slide-over, ?schedule deep link, EditPitchSheet deleted | tsc 0/0, build 3/3 |
| 8 | (this) | RTL sweep (8 files → 0 physical props), i18n parity 393/393, loading keys | tsc 0/0, build 3/3 |

## Cycle outcomes (vs Abdullah's report)
- ✅ Admin sees ONLY admin tabs (UI + API enforced 403)
- ✅ Admin Pitches tab: search/edit/move venue + owner transfer (venues)
- ✅ Admin match edit (name/type/gender + self-mode schedule)
- ✅ Disputes/reports: reopen (both outcomes) + edit outcome, fully Arabic
- ✅ Partner dashboard informational (upcoming, trend, counts, quick actions)
- ✅ Venue/pitch edit in labeled RTL drawers; add-pitch real form
- ✅ Schedule manager = standalone slide-over (X/Esc/backdrop)
- ✅ Global RTL: shell mirrors (menu right in Arabic), 0 physical CSS props, disputes/reports pages Arabic-native

## Follow-ups (next cycle)
- Remaining HQ list pages (users/transactions/settlements/audit/dashboard/login) still have hardcoded
  English headers/actions — layout is RTL-correct (swept), copy translation is the next pass (board P1-12 companion).
- P1-12 kanban item: visual RTL check — needs Abdullah's eyes (browserless box).
- Admin partner-inspection removed entirely (per product rule) — support flows now run through HQ tabs.
