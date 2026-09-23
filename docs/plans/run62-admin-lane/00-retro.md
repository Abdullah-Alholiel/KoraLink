# Run #62 — Admin lane (62%4=2) — Gate 0 Retrospective

**Context this run:** adopted dead run #61 (kill-pattern #11 — holder session died ~13:48Z after
pushing d71f4f5/7d143ae/79e77de; RUNS report never written; lock released by this run). Both
dead locks (run-60 projects-dir + run-61 staging worktree) removed per watchdog directive.

## Baseline audit (admin area)

- `git log --oneline -8 -- apps/admin`: 80ba859 (P2-69 focus parity) is the newest admin commit —
  landed run #61. Tree dirt at run start = run #61's adopted P1-52 half-work (reports/[id] +
  ar/en.json) + known build-churn fallback-*.js (checkout, never commit).
- Run #61's P1-52 half-work verified directly (run-#54 lesson): ConfirmDialog prop contract
  matches (ConfirmDialog.tsx:9-17), i18n keys present both locales, stale-banSubject fix coherent,
  checkbox gated on isUserSubject && resolved. Completed + gated (turbo 3/3, vitest 608/608,
  admin tsc 0) → committed 4f1edd3 with a Reviewer-A re-entry guard folded in.
- Reviewers (glm-5.3-flash, zai, 38s+166s): A = APPROVE-WITH-FINDINGS 0 C/I; B = all 3 run-#61
  claims VERIFIED-TRUE (independent jest run + code reads).

## Tech-debt / findings triage (evidence-checked, not vibes)

- Reviewer B P1 "reports evidence never rendered" → **REFUTED as stated**: `evidence`
  (schema.ts:951) belongs to `disputes`; admin disputes page ALREADY renders it
  (disputes/[id]/page.tsx:223-236). `reports` has no evidence column; PWA ReportSheet captures
  none. Real residue = report attachments = the parked P1-38/P2-50 upload-pipeline owner decision.
  Boarded as a note on P1-38, not a new build item.
- **Confirmed P1 (buildable):** users/[id] moderation ergonomics — ban fires `act({banned:true})`
  with NO confirmation (page.tsx:157) while reports-flow ban just got one (P1-52, inconsistent
  blast-radius protection); suspension is ONE hardcoded 7d preset (page.tsx:170), no 24h/30d,
  no extend-while-suspended. → built this run as P1-53.
- **Confirmed P2 (built, tiny):** resolve/update report DTO `resolution` unbounded
  (@IsString only, resolve-report.dto.ts:11-12); API accepts PAST suspendedUntil
  (users.service.ts:207 — writes already-expired row silently).
- **P2 boarded, not built:** client-side suspension predicate clock-skew (users/[id] page.tsx:9-14
  recomputes with browser clock vs server source of truth); reports queue lacks age/SLA ordering;
  reporter identity degrades to '—' without anonymous/withdrawn distinction.
- fix:feat ratio healthy (adoption+1 feature+2 hardening fixes; no reactive loop).

## Decision

Proceed Gate 1→4 autonomously (cron mode). Slice 1 = API hardening (DTO MaxLength + suspend
future-guard + jest). Slice 2 = users/[id] ban-confirm + suspension presets + action-error
surface + i18n ×2.
