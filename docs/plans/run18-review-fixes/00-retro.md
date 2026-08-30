# Run #18 Cycle — Review Fixes + Chat-Message Reporting (Gate 0 Retro)

**Cycle scope:** reviewer findings from run #17 areas + Reviewer B product gaps.
**Baseline:** 0e33419 (run #17 report commit).

## Commit pattern (last 15)

Run #17 landed 4 feat commits (7c5a6e1, 1141b40, 14ab3a2, b12d13e, 088942c partial) + docs.
fix:feat ratio healthy (≈0:4 this cycle — no fix-loop). Migrations committed WITH code
(0024, 0025 same-run) — Phase 4.5 rule respected.

## Retrospective audit of run-#17 areas (reviewer + self, evidence-cited)

| # | Finding | Verdict | Action |
|---|---------|---------|--------|
| A1 | `partner.service.ts:127-128` hours PATCH wrote raw `dto.open_hour` (undefined on partial updates) instead of the merged pair | CONFIRMED by read. Behavior accidentally correct (drizzle `mapUpdateSet` filters undefined, verified in node_modules/drizzle-orm/utils.js) but code lies and depends on a lib detail | **Fixed this run** (2 lines) |
| A2 | `useReports.ts` rewrite dropped `trackEvent('report_submitted')` + `onError captureError` — report failures stopped reaching Sentry/PostHog (ReportSheet has no error capture of its own) | CONFIRMED via `git show 2060c65:...` vs current | **Folded into P1-31 slice** (same file) |
| A3 | `generateSlots` "skipped double-count" (rows.length - created vs totalCapacity - rows.length) | **REFUTED by arithmetic**: categories disjoint; sum = totalCapacity − created = exact. No fix | Recorded |
| B0 | Sentry web: `FetchError: Insufficient wallet balance` (new, 2026-08-30) | Triaged MINOR: publish path already classifies it → localized PublishWarningSheet with top-up CTA (`lib/publish-error.ts`). Sentry noise from a handled 4xx, not a broken flow | Board note only |
| B1 | No club detail page | REAL product gap (API has public venue detail) but a full page = multi-day slice | Boarded P1-32 |
| B2 | **Chat messages not reportable** (`REPORT_SUBJECT_TYPES = ['user','match','venue']`, no affordance in messages page) — moderation hole for a chat product | CONFIRMED. `subject_type` is `varchar(50)` → no migration needed | **BUILT this run as P1-31** |

Bug-class sweep (Reviewer A, re-verified): `::uuid` 0 · `eq(col,null)` 0 · console.* API 0 ·
i18n parity 673/673 · z-index clean. Admin focus (rotation layer run#%4=2): types current,
RBAC single-source, no dead buttons — clean.

Minor debt (boarded P2-31, not built): admin hours form `Number()` NaN guard + client-side
close>open rule; reports listMine 50-cap + raw subject_id fallback label; overnight venue
windows (close<open) unsupported; offline banner only on feed/play/wallet; POTM push worker
`data.winnerId` removal — client confirmed updated, worker read is matchId-only.

**Proceed to Gate 1:** YES — one fix (A1) already applied; one vertical slice (P1-31 + A2) sized
~45-60 min; rest boarded.
