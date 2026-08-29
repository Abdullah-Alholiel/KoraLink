# Run #17 — Reporter closure (P2-23) — Gates 0-3 compact

## Gate 0 — Retro (area audit)
`POST /reports` is the ONLY reports endpoint today (reports.controller.ts:8-17) — a reporter
can submit but never reads back status (P2-23, boarded run #10). Admin `resolve()`
(admin/reports.service.ts:77-118) updates status/resolution, audits, broadcasts ops — and
tells nobody outside the ops room. Reports table already carries everything a closure
surface needs (status, resolution, resolved_at). Precedent for new activity verbs: run #14's
`player_removed` (enum `ADD VALUE IF NOT EXISTS` migration 0023 + PWA maps). Delivery
preferences now enforced on ALL pushes (P2-27, this run).

## Gate 1 — Product
**Problem:** reporters never learn what happened after they report — no status surface, no
closure signal; trust in the moderation flow erodes.
**User story:** as a reporter, I can see my reports and their outcomes, and I get notified
when one is resolved or dismissed.
**In scope:** player-facing `GET /reports` (own reports, status + resolution + subject label);
`report_resolved` notification (activity feed + bell + push) fired by admin resolve; PWA
"My Reports" list with the 5 UX states.
**Out of scope:** admin dispute-message replies (P2-2), appeal flow, report editing.
**Success criteria:** reporter's list shows live statuses; resolving in the console produces
a bell + feed item for the reporter; push delivered unless muted/quiet (per P2-25 decision).

## Gate 2 — Architecture
- API: `ReportsController` += `@Get()` → `listMine(reporterId)` (limit 50, newest first);
  rows selected explicitly (id, subject_type, subject_id, reason, status, resolution,
  resolved_at, created_at) + subject label resolved for user/match/venue subjects
  (name/title), never contact data.
- API: `AdminReportsService.resolve` fires (after commit, failure-tolerant try/catch —
  notification must not fail the resolution): activities `report_resolved` (recipients:
  [reporter_id]) + `sendPushToUsers([reporter_id])` with title "Report update" (English push
  text = known P2-8 gap, accepted).
- DB: `ADD VALUE IF NOT EXISTS 'report_resolved'` to the activity verb enum (migration 0025,
  code committed first per Phase 4.5).
- PWA: verb wired in feed/bell/toast maps + i18n; new `(main)/reports/page.tsx` list
  (status pill, reason, resolution text, dates) + profile "My Reports" menu link.

## Gate 3 — Program design (contracts)
**GET /reports (auth)** → 200
```json
{ "reports": [ { "id": "…", "subject_type": "user|match|venue", "subject_id": "…",
  "subject_label": "Salem Ahmad", "reason": "…", "status": "open|reviewing|resolved|dismissed",
  "resolution": "…" | null, "resolved_at": "…" | null, "created_at": "…" } ] }
```
**resolve() side effect:** activity verb `report_resolved`, recipients [reporter_id];
push body: `Your report was ${outcome === 'resolved' ? 'resolved' : 'reviewed and dismissed'}.`

### Contract verification checklist (Gate 3 — explicit)
- [x] Mutations return populated objects — resolve() keeps returning populated `findOne`;
      no mutation shape changes.
- [x] Frontend types accept backend JSON — `MyReportApi` mirrors the exact row above;
      `subject_label` always present (resolveSubjectLabel falls back to the raw id).
- [x] Adapter — thin `adaptMyReports` (dates → strings as returned; label passthrough).
- [x] No silently-undefined fields — every selected column is NOT NULL except
      resolution/resolved_at which the type marks nullable; list selects them explicitly.
- [x] i18n — `reports.*` section (title/subtitle/empty + status labels reuse
      admin-style keys) + `feed.reportResolved`/bell/toast entries in en AND ar; parity checked.
