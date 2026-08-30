# Run #18 Cycle — Program Design (Gates 1–3 compact)

## Problem (Gate 1)

Chat harassment is the #1 report category for social/booking apps, but KoraLink's reports
system only accepts `user | match | venue` subjects — there is no way to report an abusive
DM. Reviewer B (run #18): "for a realtime chat product this is a moderation hole."
While wiring the new subject type, restore the observability the run-#17 rewrite of
`useReports.ts` accidentally dropped (report submissions untracked, failures invisible to
Sentry).

**User story:** As a player, I can long-press (or tap ⋯ on) an abusive direct message and
report it, and see the report + its outcome in My Reports — same flow as reporting a user.
**Success criteria:** message report appears in admin queue with sender + content snippet
visible to admins only; reporter sees "Message from <name>" in My Reports; i18n parity;
vitest/jest/build all green.

**IN:** `message` subject type end-to-end (API validation/existence/dedupe/labeling, chat UI
affordance, My Reports label, admin queue filter + detail view + jest tests, i18n en+ar,
observability restore). **OUT:** match-chat (lobby) reporting (same DTO change covers it
later, no UI this run); deleting/hiding reported messages; any schema migration.

## Contract (Gate 3 — exact shapes)

### API

- `POST /api/v1/reports` DTO: `REPORT_SUBJECT_TYPES = ['user', 'match', 'venue', 'message']`;
  `subjectType: 'user' | 'match' | 'venue' | 'message'`.
- `ReportsService.create()` self-report rule extended: block when
  `subjectType === 'message' && message.sender_id === reporterId` (sender lookup via
  `personal_messages`).
- `assertSubjectExists('message', id)` → `personal_messages` lookup → 404
  `Message not found.` when absent.
- `listMine()` adds `LEFT JOIN personal_messages pm ON subject_type='message' AND
  pm.id = subject_id` + `LEFT JOIN users su ON su.id = pm.sender_id`; label fallback chain
  becomes `user_name ?? match_title ?? venue_name ?? ('Message from ' + sender_name) ??
  subject_id`. Response shape unchanged otherwise.
- Admin `resolveSubject('message', id)` → `{ type:'message', id, label: 'Message from
  <sender> · "<first 60 chars of content>"', status: 'sent' | 'missing' }`.
- Admin `list()` SQL gains `LEFT JOIN personal_messages pm ON r.subject_type='message' AND
  pm.id = r.subject_id` + `su` join; `COALESCE(u.full_name, u.handle, m.title, v.name,
  'Message from ' || su.full_name)`.
- Dedupe/PII invariants unchanged: dedupe per (reporter, subject) among open/reviewing —
  reporting 2 different messages from the same sender = 2 allowed reports; message content
  visible ONLY via admin detail (players see label only).

### Frontend

- `useReports.ts`: `ReportSubjectType` adds `'message'`; `useReport()` regains
  `onSuccess: trackEvent('report_submitted', {subject_type, subject_id})` +
  `onError: captureError(err, {scope: 'report'})` (A2 restore, exact pre-2060c65 shape).
- `messages/[id]/page.tsx`: `ReportSheet` state; per-bubble overflow ⋯ button (their messages
  only) → `subjectType="message" subjectId={m.id} subjectLabel={t('report.subjectMessage')}`.
- i18n new keys (en + ar, both files): `report.reportMessage`, `report.subjectMessage`,
  `report.messageSheetTitle`; `reports.subjectType.message` = "Message" / "رسالة".
- Admin `types.ts`: `subject_type`/`ReportSubject.type` unions add `'message'`; queue filter
  adds `<option value="message">Message</option>`.

### Verification checklist (run before Gate 4)

- [x] No mutation-contract change (POST /reports returns report row — unchanged).
- [x] PWA types accept the JSON the API produces (`MyReportApi.subject_type` widened to the
  same union; label chain covered).
- [x] Adapter: none needed (label computed server-side, passthrough).
- [x] No silently-undefined field: `subject_label` fallback always yields a string.
- [x] i18n keys exist in BOTH ar.json and en.json (4 new keys + subjectType.message).
- [x] No migration required (`subject_type` = varchar(50); reports table unchanged).

### Slices

1. **S1 (fix):** A1 merged-pair hours PATCH (already patched) + partner jest if present →
   commit.
2. **S2 (tracer):** DTO + service (create/self-rule/exists/listMine) + admin
   resolveSubject/list + types + jest message cases → tsc + build + jest green → commit.
3. **S3:** PWA: useReports (type + observability restore) + chat ⋯ affordance + ReportSheet
   wiring + i18n en/ar → vitest + type-check green → commit.
