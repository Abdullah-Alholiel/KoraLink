# Gate 3 — Program Design (CONTRACTS): Reports Moderation Queue

## Schema (extend `reports` in `schema.ts`)
```ts
export const reports = pgTable('reports', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  reporter_id: varchar('reporter_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject_type: varchar('subject_type', { length: 50 }).notNull(),   // 'user' | 'match' | 'venue'
  subject_id: varchar('subject_id', { length: 36 }).notNull(),
  reason: text('reason').notNull(),
  status: reportStatusEnum('status').notNull().default('open'),      // open|reviewing|resolved|dismissed
  resolution: text('resolution'),                                    // NEW
  resolved_by: varchar('resolved_by', { length: 36 }).references(() => users.id, { onDelete: 'set null' }), // NEW
  resolved_at: timestamp('resolved_at', { withTimezone: true }),     // NEW
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()), // NEW
}, (t) => [
  index('reports_status_idx').on(t.status),
  index('reports_subject_type_idx').on(t.subject_type),
]);
export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, { fields: [reports.reporter_id], references: [users.id] }),
  resolvedBy: one(users, { fields: [reports.resolved_by], references: [users.id] }),
}));
```

## API — user-facing (reports module)
`POST /api/v1/reports` — `@UseGuards(JwtCookieAuthGuard)`, body:
```ts
class CreateReportDto {
  @IsIn(['user', 'match', 'venue']) subjectType: 'user' | 'match' | 'venue';
  @IsString() subjectId: string;
  @IsString() @MaxLength(1000) reason: string;
}
```
Returns `Report` (created row).

## API — admin (AdminAuthGuard)
`GET /api/v1/admin/reports?status=&subjectType=&page=&perPage=` → `{ reports: ReportRow[], total, page, perPage }`
`ReportRow` = { id, subject_type, subject_id, reason, status, resolution, created_at, resolved_at, reporter_name, reporter_handle, subject_label }
`GET /api/v1/admin/reports/:id` → `ReportDetail` = { ...ReportRow, reporter: {id, full_name, handle, avatar_url, phone}, resolved_by: {id, full_name} | null, subject: { type, id, label, status } }
`POST /api/v1/admin/reports/:id/resolve` — body:
```ts
class ResolveReportDto {
  @IsIn(['resolved', 'dismissed']) outcome: 'resolved' | 'dismissed';
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsBoolean() banSubject?: boolean;  // only when subject_type==='user' && outcome==='resolved'
}
```
Returns `ReportDetail` (fully populated after resolve).

## Frontend contracts
**Admin `lib/types.ts`:** `AdminReport`, `ReportSubject` types.
**Admin pages:** `/reports` (queue: filter by status/subject-type, inline `Reviewing`/`Resolve`/`Dismiss`), `/reports/[id]` (detail + resolve sheet).
**PWA:** `ReportSheet` bottom sheet (subjectType/subjectId/reason) + `useReport()` hook → `POST /reports`. i18n keys in `ar.json`/`en.json`.
