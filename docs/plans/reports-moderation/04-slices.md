# Gate 4 — Vertical Slices: Reports Moderation Queue

## Slices built (end-to-end)
1. **Schema** — `reports` extended (resolution, resolved_by FK, resolved_at, updated_at + subject_type index); migration `0013_silky_hemingway.sql` generated + applied.
2. **User creation** — `modules/reports` (`POST /reports`, `JwtCookieAuthGuard`) with self-report + open-duplicate guards and subject-existence validation (user/match/venue).
3. **Admin review** — `modules/admin/reports.*` (`GET /admin/reports`, `GET /admin/reports/:id`, `POST /admin/reports/:id/resolve`) with subject-context resolution, optional ban-on-resolve (reuses `AdminUsersService.update` guards), audit + `broadcastOps('reports')`.
4. **Admin UI** — `/reports` queue (status + subject-type filters, live-refresh) + `/reports/[id]` detail/resolve; RBAC (`reports` section, `report.resolve` action) + sidebar `Flag` entry.
5. **PWA creation** — `useReport` hook + `ReportSheet`; "Report match" on match detail (both states), "Report user" in `PlayerProfileSheet`; `report` i18n namespace (ar + en).

## Verification (real output)
- `npx tsc --noEmit -p apps/api/tsconfig.json` → exit 0
- `turbo run build` → **3/3 tasks successful** (api + pwa + admin), exit 0
- `npx vitest run` (apps/player-pwa) → **182/182 passed, 24 files**
- Live E2E (dev-login + curl): create → list → detail → resolve all correct; self-report guard 400.

## Known follow-ups (out of v1 scope)
- Venue report entry point in the PWA venue UI (backend supports `venue` subject type already).
- Automated consequence application beyond user-ban (e.g. match cancellation on resolve).
- Reporter notification of resolution outcome.
