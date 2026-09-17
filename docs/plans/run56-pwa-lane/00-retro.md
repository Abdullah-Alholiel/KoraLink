# Run #56 — Gate 0 Retrospective (PWA lane, rotation 56%4=0)

**Baseline:** run #55 head `f5d99bf` (P2-56 FK indexes + docs).

## What landed since last cycle
- `ef39d13` + `5676c23` — P2-56: 12 FK leading-column indexes (0042) + audit script. **VERIFIED this run** (audit 42/42 FK led exit 0; all 12 names confirmed in live `pg_indexes` with correct definitions; Reviewer B independently CONFIRMED migration/schema/journal coherence; journal path nuance: file is `drizzle/meta/_journal.json`).
- Turbo build gate re-run this run: 3/3 exit 0. Services green, 0 journal errors 5h, Sentry: no new signatures.

## Admin state check (MANDATORY)
`git status --short apps/admin` → **STILL DIRTY** (owner in-flight: ConfirmDialog.tsx, DataTable.tsx, Drawer.tsx). → **ADMIN HOLD continues**: P2-69, P2-68 not touched. Non-admin items only.

## Tech debt audit in the area this cycle touches (PWA auth/error surfaces)
- `users.service.ts:446-455`, `auth.service.ts:204-211` + `:299-302`, `jwt-cookie.strategy.ts:120-124`: ban/suspend/deleted guards throw raw English `ForbiddenException`/`UnauthorizedException` with NO stable machine code → PWA `classifyError` can only say generic "forbidden" (403) / "unauthorized" (401). Arabic-first banned users get English-only, reason-less blocks. → **P1-47 (this cycle).**
- `[locale]/offline/page.tsx:7-20`: hardcoded local ar/en string map + hardcoded English `aria-label="Retry connection"` — bypasses locale dicts (P2-40 fixed only the nav fallback). → **P2-70 (this cycle).**
- Reviewer A sweep: no `::uuid` casts, no `eq(col,null)`, no console.* in API prod paths, i18n parity exact (948/948 leaf keys), z-index contract intact, hydration clean, matches mutation contract verified. MINOR (queued, not built): floating CTA z-40 under nav z-50 on match detail (offset-var mitigated); fk-index-report.mjs composite-FK ref_table reporting imprecise (report-only).
- Reviewer A "spots_filled unfiltered COUNT" flagged IMPORTANT → **REFUTED as a bug**: host-inclusive counting is the mandated convention (§4 of factory skill, Abdullah's explicit correction); no change.
- Reviewer B product gaps (ranked): P0 offline-surface thinness (clubs/matches generic error copy — board candidate), P1 socket reconnect cap 5 with no visible reconnecting state (board candidate), P1 sheet-level retry/empty inconsistencies, P2 report-status visibility, P2 TeamLineup hit targets. → boarded as P2 rows, not built this run (PWA-lane budget goes to P1-47 + P2-70).

## Verdict
Proceed to Gate 1 for P1-47 (banned/suspended localized blocked-account UX) and P2-70 (offline page i18n). No admin work.
