# Run #186 — Program Design (Gates 1–3 compact)

## Problem
1. **P2-292 (+ Reviewer A #186 I-2/I-3):** `AdminAuditController` is the only admin controller doing its own persistence (raw Drizzle SQL + JOINs inline). Worse, the `INNER JOIN users` drops audit rows whose admin was hard-purged (PDPL erase) — the immutable trail silently shrinks.
2. **P1-74:** venue reviews are not reportable. Subject types are `user|match|venue|message` only; an abusive review can only be moderated if staff stumble on it.

## User stories
- As a player, I can flag an offensive venue review; it lands in the admin reports queue like every other report. (P1-74, user-visible)
- As an operator, audit history for purged admins still renders (name shows "—"). (P2-292 rider)
- As a maintainer, the audit endpoint follows the same controller→service seam as every other admin module. (P2-292)

## Scope
IN: reports subject type `review`; report affordance in VenueReviewsSection rows (reuse ReportSheet); label resolution in BOTH mine-list + admin COALESCE (+`thReview` admin i18n); AdminAuditService lift; INNER→LEFT JOIN; throttle on admin refund route.
OUT: new DB columns/indexes (reports table already generic); admin review-page changes (P2-291 done); host page UX states (P2-307 new row, future run); appeals flows.

## Architecture delta
- **API:** `admin/audit.service.ts` NEW (takes `@Inject('DB_CONNECTION') db`); controller delegates `list()` to it. `AdminModule` registers the service. `INNER JOIN users u` → `LEFT JOIN` (`admin_name` nullable; admin page already renders `?? '—'`). `@Throttle` on `POST admin/transactions/:id/refund` (60/min — same posture as P2-295 money routes).
- **API:** `REPORT_SUBJECT_TYPES` gains `'review'`; `assertSubjectExists` gains a `venue_reviews` branch (generic fallback stays last for venue); mine-list SELECT adds `venue_reviews → users` join chain for `review_author_name`; label fallback order gains `review_author_name` → "Review by <author>".
- **Admin:** `hq.thReview` key (EN "Review" / AR "مراجعة"); `<option value="review">` in the subject filter.
- **PWA:** `ReportSubjectType` gains `'review'`; `VenueReviewsSection.ReviewRow` gets a report Flag button (auth+not-mine gated), opens shared `ReportSheet` with `subjectType="review"`; toast on open + success via existing sheet; `clubs.reviewReport`/`clubs.reviewReported` i18n EN+AR.

## Exact API JSON shapes (Gate 3 contract)
- `POST /reports` request adds enum value: `{ "subjectType": "review", "subjectId": "<36-char uuid>", "reason": "..." }` → `201 { id, status }` (unchanged shape).
- Invalid review id → `404 { message: "Review not found.", error: "Not Found", statusCode: 404 }`.
- Own-review report → `409 { message: "You cannot report your own review." }` (mirrors the message-subject self-report rule).
- `GET /reports` (mine) item gains label form: `subject_label: "Review by <full_name or 'Anonymous'>"` when `subject_type='review'`; all other fields unchanged.
- `GET /admin/reports` rows: `subject_label` COALESCE gains review branch; new `subject_type` value flows through unchanged (filter already generic).
- `GET /admin/audit-logs`: `{ logs, total, page, perPage }` unchanged; `logs[].admin_name` now `string | null` (was implicitly non-null for surviving rows; TS type updated).
- `POST /admin/transactions/:id/refund` unchanged shape; now rate-limited 60/min.

## TS signatures
```ts
// reports.service.ts
private async assertSubjectExists(type: ReportSubjectType, id: string): Promise<void> // + review branch
async listMine(reporterId: string, query?: ListMyReportsDto): Promise<{ reports: MyReportRow[]; total: number; hasMore: boolean }>
// admin/audit.service.ts (NEW)
export class AdminAuditService { constructor(@Inject('DB_CONNECTION') private readonly db: DB) {} async list(dto: ListAuditDto): Promise<AuditListResult> }
```

## Adapter/hook contracts
- PWA `ReportSubjectType = 'user' | 'match' | 'venue' | 'message' | 'review'` (useReports.ts) — pure widening; `useReport()` unchanged.
- `ReportSheet` props unchanged (`subjectType: ReportSubjectType`).

## i18n contracts (both locales, same commit)
- PWA `clubs.reviewReport` = "Report review" / "الإبلاغ عن التقييم"; `clubs.reviewReported` = "Review reported. Our team will take a look." / "تم الإبلاغ عن التقييم. سيطّلع فريقنا عليه."
- Admin `hq.thReview` = "Review" / "مراجعة".

## Contract verification checklist (Gate 3)
- [x] No mutation endpoint changed → mutation-return contract untouched (refund still returns populated re-read).
- [x] Frontend types accept exact JSON: MyReportApi.subject_label already `string`; ReportSubjectType widened at the only source.
- [x] Adapters: none new (labels computed server-side; existing mine-list mapping extended in place).
- [x] No silently-undefined field: review label falls back through author → subject_id.
- [x] i18n: 4 keys total, both locales, one commit.
- [x] Schema: zero table/column/index changes → NO migration needed (drizzle journal untouched).

## Risks & mitigations
- Spec mocks pattern-match `select().from(table)` by table identity → update both reports specs' mocks for the new `venue_reviews` probe (assertSubjectExists review branch) before gates.
- Mine-list `total` uses `COUNT(*) OVER ()` — adding LEFT JOINs must not fan out rows (venue_reviews↔users joins are 1:1 by PK) → count safe.
- Admin audit consumers: only `apps/admin/src/app/(dashboard)/audit/page.tsx`; already null-safe on admin_name.
