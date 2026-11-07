# Run #130 — Compact Gate 0-3 (Admin lane, 130 % 4 = 2)

## Gate 0 — Retrospective
- **Previous-run verification (claims ≠ facts): P2-191 TRUE** — status predicates at
  disputes.service.ts:384 + reports.service.ts:267, 409 ConflictException on 0-row
  (:388 / :271), dev-login `@Throttle 3/min` auth.controller.ts:135,
  write-concurrency.spec.ts present (18 `it(` cases; run #129 claimed 17 —
  off-by-one in the report only). **P2-194 TRUE** — retryAfter at auth.service:74,
  email-otp:70, users.service:585; `getCooldownRemaining` otp-store:67; ICU plural
  keys in en.json + ar.json; fetcher-retry-after.test.ts exists. Both → DONE.
- **DECISIONS.md consulted (Gate 0 supremacy):** no contradiction — the build
  (optimistic concurrency on admin edits) is a data-integrity hardening, not a
  design/UX change. Drawer-RIGHT, RecordDrawer, DataTable standards untouched.
- **ADMIN STATE CHECK (Phase 3.5 step 0):** tree clean, no dirty admin/partner
  files, koralink-admin.service active, no in-flight owner work → admin lane OPEN;
  P2-192 pickable per run #129's handoff.
- **Tech-debt observation (carried):** Reviewer A found the P2-191 guard pattern is
  inconsistent across admin services — venues.service.ts:189 + pitches.service.ts:130
  `update()` have no returning/0-row check (mitigated by follow-up findOne→404, but
  the audit pair records the stale row on a lost race). Boarded consideration for a
  later hardening item; not built this run (budget → P2-192).
- **Hex lane:** drift detected (api_exc_total 269→271), ATTRIBUTED to PR #123's
  deliberate new ConflictException throws (disputes:388, reports:271) —
  improved + → baseline updated to 271; re-audit clean, 11/11.
- Sentry triage: zero NEW signatures (API-B unchanged count 130, self-inflicted
  CORS probes; WEB-D hydration last seen 09-14, pre-dates the frozen web project).

## Gates 1-3 — Program design (P2-192, optimistic-version token)

### Problem
P2-191's status predicate detects status TRANSITIONS only. Two admins editing
decision/note while status is unchanged: last write wins silently, one audit pair
mis-recorded. PR-Agent r2 MINOR on PR #123 (boarded P2-192).

### User story
As an HQ admin, when I save a dispute/report edit, I want a clear 409 when someone
saved meanwhile, so we never silently lose an admin's decision note.

### Scope
IN: `version` integer column on disputes + reports (0051); guarded update() on both
services (version predicate, 409 with `{ version }` body, legacy-allowed when DTO
omits it); tests: rendered-WHERE assertion + concurrency scenarios + legacy path;
admin UI: version echo on 409 (specific message), optimistic re-sync on save.
OUT: venue/pitch update() guard parity (boarded consideration), player surfaces,
resolve/reopen flows (already guarded by P2-140/P2-191).

### Architecture delta
- DB: `0051_admin_edit_version_tokens.sql` — `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1; ALTER TABLE reports ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;`
- Schema.ts: version col + index unchanged (no new index — updates are by PK).
- API: `update()` predicated `.where(and(id, status, version))`; bump sets
  `version: before.version + 1` in `.set()`; SELECT ... FOR UPDATE not needed
  (single-statement predicated UPDATE is atomic; before-read is advisory for
  audit pair); 409 body `{ version: <current> }` so the client can resync.
- FE admin: disputes/[id] + reports/[id] pages capture `data.version` at edit
  start; on 409, `version 409` → specific i18n message (en+ar) + reload().
- Observability: existing Sentry/Pino wire automatically; new 409s visible in
  journal; no new posthog event needed (admin-side).

### Exact API shapes (Gate 3 contract)
PATCH /api/v1/admin/disputes/:id  body `{ decision?, internalNote?, version? }`
PATCH /api/v1/admin/reports/:id   body `{ resolution?, version? }`
- 200 → full populated object (findOne outside tx) incl. new `version: number`.
- 409 (version/status race loser) → `{ statusCode:409, message:'...concurrently
  updated — re-check its status.', error:'Conflict', version: <current row> }` —
  version field lets a client decide to reload + re-apply.
- Legacy clients (no version in DTO): behavior UNCHANGED from P2-191 (status
  predicate still applies; write proceeds; version bumps).

### TS signatures
- `UpdateDisputeDto { decision?: string|null; internalNote?: string|null; version?: number }`
- `UpdateReportDto { resolution?: string|null; version?: number }`
- `disputes.service.update(id, dto, adminId, ip?)` → `Promise<DisputeDetail & { version: number }>`
- `reports.service.update(id, dto, adminId, ip?)` → `Promise<AdminReportDetail & { version: number }>`

### i18n keys (admin, EN + AR)
- `hq.editStale` : "Someone saved this record while you were editing — the view has been refreshed; re-apply your changes."
- `hq.editStaleAr` (ar.json): the Arabic mirror of the same message.
- Type-check parity enforced by the existing admin i18n parity test.

### Contract verification checklist
- [x] Mutations return fully populated findOne outside tx (unchanged from P2-191 shape)
- [x] Frontend types accept exact JSON: DisputeDetail/AdminReportDetail gain `version: number` (response), DTO gains optional `version?`
- [x] Adapter functions: admin pages consume the API shape directly (useLiveAdminData), no adapter drift
- [x] No field silently undefined: version NOT NULL DEFAULT 1 → backfilled for all rows
- [x] i18n keys exist in BOTH locales before UI wiring
