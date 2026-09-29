# Run #86 — Admin CSV export on financial pages (P2-68)

## Gate 0 — Retrospective (compact)

Rotation: 86%4=2 → **Admin console lane**. ADMIN STATE CHECK (pre-pick, 2026-09-29T10:2xZ):
`git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → **clean**
(Abdullah not mid-flight); last admin commit 5c041fd (P2-115, PR #44); admin service active;
routes live (transactions/settlements/audit pages all present). No hold.

Recent-cycle audit (Gate 0 duties):
- Run #85 (P2-12, PR #49) verified this run BEFORE picking: serving dist grep pitchOwnerScope=5 /
  slotOwnerScope=2 ✓; partner jest 7 suites / 63 tests green (fresh run) ✓; 403 contract pin at
  partner-scope-hardening.spec.ts:399 ✓; Reviewer B independently re-verified (a)-(e) all ✓.
- Standing bug-class sweep (Reviewer A, 133s): **0 CRITICAL**. 0 ::uuid casts, 0 eq(col,null),
  0 console.* in API/admin services, i18n 614=614 exact. 3 IMPORTANT hydration-hazard leads on
  admin client pages (Date.now()/weekStart() computed at render; layout role flash) — low impact,
  page-guarded; recorded as board follow-up note, not built this run (P2-68 is the lane item).
- fix:feat ratio recent window: healthy (fixes were review-driven, not regression-driven).

Decision: P2-68 selected — highest-priority Admin-lane item that is startable AND finishable
(vertical slice, no owner dependency, CSV format decision already on the row: "CSV+BOM is the
safe default"). Reuses the proven P2-119 wallet-CSV pattern. Higher-priority rows are all
owner-gated (P0-2/P1-8/P1-14/P1-29 money; P1-49/P1-51 decisions) or held (P2-89 stale-HOLD note).

## Gates 1-3 — Program design (compact, one doc per autonomous mode)

**Problem:** finance reconciliation on admin financial pages = manual pagination; no export.

**User story:** as an Admin finance operator I export the transactions / settlements / audit
list I'm looking at to CSV so I can reconcile in Excel (Arabic-Excel compatible).

**Scope:** IN — shared pure csv-export lib (BOM + OWASP formula guard + UTC filename), Export
buttons on the 3 pages (current page's rows, same visible columns), EN+AR i18n, PostHog event.
OUT — server-side export endpoints, date-range/cross-page export (P2-119 pattern already ships
the richer version player-side; admin gets page-export MVP), column pickers, test infra changes.

**Contracts:**
- `buildCsvExport(opts: { columns: {key,header}[]; rows: T[]; filePrefix: string; timestamp: Date }): void`
  pure function + `exportCsv()` DOM trigger in `apps/admin/src/lib/csv-export.ts`.
- Filename `<filePrefix>-YYYY-MM-DD-HHmm.csv` (UTC, zero-padded). Blob `text/csv;charset=utf-8`,
  BOM `\uFEFF`, anchor download, `URL.revokeObjectURL` cleanup.
- OWASP guard: leading `,`/`=`/`+`/`-`/`@`/tab/CR cells get a `'` prefix (mirrors wallet-csv.ts).
- i18n keys: `hq.exportTransactions`, `hq.exportSettlements`, `hq.exportAudit`,
  `common.exportCsv` — BOTH en.json + ar.json, leaf parity MUST stay 614+4=618/618.
- Analytics: `trackEvent('admin_csv_export', { page, rows })` on each click.

**Gate 3 checklist:**
- [x] No API/mutation changes → mutation-contract rule N/A.
- [x] Frontend types: rows already typed (`AdminTransaction` / settlement / audit types); export
      reads the same fields the DataTable renders — no silent-undefined surface (columns derive
      headers from the same i18n keys the table uses).
- [x] i18n keys added to both catalogs before build; parity asserted post-build.
- [x] OWASP/BOM/filename behavior pinned by the shared lib, not per-page copies.

**Gate 4 plan:** single vertical slice (lib → 3 page wirings → i18n → analytics → build).
Executed via zeroshot lane (preconditions all ✓: Pro auth, zeroshot 10.7.0, clean admin tree,
vertical-slice item); parent runs REAL gates on the lane diff before merge, per factory rules.

---

## Addendum (2026-09-29T12:30Z) — Item 2 outcome (P2-124)

Built parent-side on the same lane discipline via PR #51 (branch lane/run86-p2-124-admin-hydration,
6 commits deb5509→edb0390, squash `0a48eb8`):

- **5 PR-Agent review rounds** — each round's findings fixed on-branch before merge:
  1. Initial (5 pushes worth of evolution): Sunday-rollover stale week window (MINOR).
  2. Round 2: three findings converged on "shared TZ-correct lib/week.ts + sync refresh at
     drawer-open + single source" → created `apps/admin/src/lib/week.ts`; also exposed a
     PRE-EXISTING bug the batch inherited verbatim: `toISOString()` shifted a Riyadh Sunday
     to Saturday UTC (off-by-one) — now fixed at the source with local-calendar serialization.
  3. Round 3 SECURITY note: the state-based layout guard froze the path check at mount →
     in-app navigation to a disallowed route rendered the shell until the API 403'd.
     Restored per-navigation checking via `usePathname()` WITHOUT reintroducing the
     render-time `window.location` read (render stays a pure function of hook state).
  4. Round 4 MINOR: `setGuardRole(null)` before each redirect return so a later-navigation
     null/Player role stops rendering protected children immediately.
  5. Round 5: comment overclaimed ("the moment the token is gone" — no `storage` listener);
     corrected to per-navigation scope with the cross-tab listener documented as future work.
- **Parent-verified REFUTATIONS (2 of Reviewer A's 3 leads):** users pages + users/[id]
  `Date.now()` suspension-status sites have NO hydration surface — rows arrive client-side
  post-mount via `useLiveAdminData` (60 s poll covers staleness). Documented in the PR body.
- **Known-issue reconfirmed:** lane-worktree `next build` fails on untouched apps via the
  symlinked node_modules (run #78 pathology); app-scoped tsc + the CI clean-room (gate +
  fresh-apply green on every push ×5) are the authoritative local/remote gates.
- Out-of-scope notes for the next admin touch: SlotManager `oneSlot.slot_date` default,
  cross-tab `storage` listener for the admin role cache.
