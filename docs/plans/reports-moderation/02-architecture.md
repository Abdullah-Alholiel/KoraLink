# Gate 2 — Architecture: Reports Moderation Queue

## Module layout
```
apps/api/src/
├── modules/reports/                    # NEW — user-facing creation
│   ├── reports.module.ts
│   ├── reports.controller.ts           # POST /reports (JwtCookieAuthGuard)
│   ├── reports.service.ts              # create() + subject-existence validation
│   └── dto/create-report.dto.ts
├── modules/admin/
│   ├── reports.controller.ts           # NEW — admin/reports (AdminAuthGuard)
│   ├── reports.service.ts              # NEW — list/findOne/resolve (+ ban side-effect)
│   └── dto/list-reports.dto.ts, resolve-report.dto.ts
└── database/schema.ts                  # extend reports table + relations
```

## Data flow
```
PWA ReportSheet → POST /api/v1/reports
  → reports.service.create(reporterId, {subjectType, subjectId, reason})
  → validate subject exists (users|matches|venues by type) → insert (status='open')

Admin queue → GET /api/v1/admin/reports?status=&subjectType=
  → AdminReportsService.list (raw SQL LEFT JOIN reporter + subject resolution)
Admin detail → GET /admin/reports/:id → findOne (drizzle with: reporter, resolvedBy + subject context)
Admin resolve → POST /admin/reports/:id/resolve {outcome, resolution?, banSubject?}
  → guard already-resolved → tx (optionally set users.banned_at) → update reports
    (status, resolution, resolved_by, resolved_at) → audit.log('report.resolve') → realtime.broadcastOps('reports')
```

## Subject context resolution (findOne)
`subject_type` union: `user` | `match` | `venue`. `findOne` returns a `subject` object resolved from the corresponding table (id + display label + link hint), so the admin detail page renders one "reported subject" card regardless of type.

## RBAC (admin frontend)
Add `reports` to `ConsoleSection`, `SECTION_BY_ROLE[Admin]`, `sectionForPath`, and `Sidebar.SECTION_META`; add `report.resolve` to `ConsoleAction` + `ACTIONS_BY_ROLE[Admin]`. VenueOwner/Player get nothing (reports are HQ-only).
