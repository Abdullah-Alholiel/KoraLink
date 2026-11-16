# Run #123 — 01-program-design.md (Gates 1–3 compact)

## Gate 1 — Product spec

**Problem (user view):** A partner reconciling payouts against SAR bank transfers must
hand-copy numbers from the earnings screen — there is no export. Every HQ list page already
has CSV export; the partner portal is the gap (Reviewer B run #122, P0-candidate → P2-178).

**User story:** As a venue partner, on Partner → Earnings I click one button and get a CSV
with (a) my per-venue revenue for the 4-week window and (b) all my settlements, to attach to
the monthly settlement reconciliation.

**Scope:** IN — export button on earnings page producing ONE CSV with two sections
(per-venue revenue, then settlements); EN+AR copy; exporter feedback notes.
OUT — date-range control (G2, logged not boarded), new API endpoints (data already on the
page), PII beyond what the page already shows.

**Success criteria:** button renders EN+AR; click generates a valid CSV (BOM, formula-guard,
RFC4180) containing per-venue rows + settlement rows; aria feedback on success/failure;
turbo build 3/3 + tsc 0 + all suites green.

## Gate 2 — Architecture

**Data flow:** no backend change. Page already fetches `GET /partner/earnings` (full
unpaginated sets: `perVenue[]`, `settlements[]`). Export builds two sections client-side via
the shared `lib/csv-export.ts` exporter (BOM + escapeCsvField formula guard + csvFilename).
Feedback via `useExportFeedback().runExport` (mode 'page') + `<ExportFeedbackNote/>`.

**Files changed:**
| File | Change |
|---|---|
| `apps/admin/src/app/(dashboard)/partner/earnings/page.tsx` | add `useExportFeedback`, `buildEarningsCsv`, button in PageHeader actions, `<ExportFeedbackNote/>` |
| `apps/admin/src/messages/en.json` / `ar.json` | +1 key `partner.earnings.exportEarnings` (EN "Export CSV" / AR "تصدير CSV"); feedback reuses `common.*` |
| `apps/api/src/modules/admin/disputes.service.ts` | list(): wrap page+COUNT in one `db.transaction` with `isolationLevel: 'repeatable read'` |
| `apps/api/src/modules/admin/disputes.sla-list.spec.ts` | mock gains `transaction` → executor; new pin: BOTH queries render identical WHERE; dead `appealTiebreak` var removed/repurposed |

**Parent contract (unchanged):** `{ disputes, total, page, perPage }` — same shape.

**Parent slice (own branch, parent-built):** disputes tx race fix.

## Gate 3 — Program design (contracts)

### Lane item P2-178 — earnings CSV export (zeroshot lane builds; parent verifies + integrates)

Button (PageHeader `actions`, alongside LiveBadge):
```tsx
<button type="button" onClick={onExport} disabled={exportDisabled}
  aria-label={tc('exportCsv')}
  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2
             text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed
             disabled:opacity-50">
  <Download className="h-4 w-4" />
  {te('exportEarnings')}
</button>
```
`exportDisabled = loading || error || exporting || (perVenue.length===0 && settlements.length===0)`
(mirrors HQ pages' disable-on-empty/loading/error; add `exporting` from feedback hook).

CSV contract (ONE file, two sections, shared exporter):
```
Section 1 header row: [Venue, Bookings, Revenue (SAR)]      ← te('csvRevenueHeader') ×3? NO —
```
Column headers reuse the EXISTING table-header keys (`partner.earnings.thVenue/thBookings/
thRevenue` + `thVenue/thAmount/thStatus/thPeriod/thPayoutRef`) — ZERO new header keys, EN+AR
for free. A single section-divider row uses `te('revenueOverviewTitle')` and `te('settlementsTitle')`
(existing keys). New keys: ONLY `exportEarnings` (+ the divider rows reuse titles).

Exact build (escapeCsvField applied by exporter; csvAmount for money; csvDate for dates):
```ts
function buildEarningsCsv(data: PartnerEarnings, t: (k: string) => string): CsvExportFile {
  const venueRows = data.perVenue.map(v => ({
    venue: v.venueName || '', bookings: v.bookedCount, revenue: csvAmount(v.revenue),
  }));
  const settlementRows = data.settlements.map(s => ({
    venue: s.venue_name ?? '', amount: csvAmount(s.amount), status: s.status,
    period: `${csvDate(s.period_start)} → ${csvDate(s.period_end)}`,
    payoutRef: s.payout_ref ?? '', created: csvDate(s.created_at),
  }));
  return buildCsvExport({
    columns: [
      { key: 'venue',   header: t('thVenue'),   value: r => r.venue },
      { key: 'bookings',header: t('thBookings'),value: r => r.bookings },
      { key: 'revenue', header: t('thRevenue'), value: r => r.revenue },
    ],
    rows: venueRows, filePrefix: 'koralink-partner-revenue', timestamp: new Date(),
    footer: t('settlementsTitle'),          // divider line before settlements section
    footerColumns: [
      { key: 'venue',    header: t('thVenue'),    value: r => r.venue },
      { key: 'amount',   header: t('thAmount'),   value: r => r.amount },
      { key: 'status',   header: t('thStatus') },
      { key: 'period',   header: t('thPeriod'),   value: r => r.period },
      { key: 'payoutRef',header: t('thPayoutRef'),value: r => r.payoutRef },
      { key: 'created',  header: t('thCreated'),  value: r => r.created },
    ],
    footerRows: settlementRows,
  });
}
```
**If `buildCsvExport` has no footer concept** (verify at implementation start): do NOT extend
the shared exporter mid-lane — call `buildCsvExport` TWICE (once per section), concatenate
`sectionA.content + '\r\n' + sectionB.content` (BOM only from section A), filename = revenue
prefix. Record which variant shipped in the run report.

Feedback: `const ef = useExportFeedback();` `onExport` wraps `ef.runExport(buildEarningsCsv(data!))`
in try/catch-free style used by HQ pages (runExport never throws); render `<ExportFeedbackNote
feedback={ef} />` after the toolbar. PostHog: `trackEvent('admin_csv_export', { page:
'partner.earnings', rows })` on success (import from `@/providers/ObservabilityProvider`).

i18n contract: `partner.earnings.exportEarnings` EN=`Export CSV` AR=`تصدير CSV`. Leaf-key
parity MUST stay equal (698/698 → 699/699). Feedback strings come from `common.*`
(exportedRows/exportFailed) — already parity-equal.

Verification (parent runs REAL gates on a real-install tree):
1. `grep -c 'exportEarnings' apps/admin/src/messages/{en,ar}.json` = 1 each.
2. Admin `npx tsc --noEmit` 0 errors (test/ not type-checked in build — but CI type-checks
   test/; run it if any test file is added).
3. `npx turbo run build --concurrency=1` 3/3 exit 0.
4. PWA `npx vitest run` — grep 'Test Files' all-pass (regression gate; PWA untouched).
5. Live probe: earnings page HTML/chunk contains the new button key string.

### Parent item — disputes list/count tx race (Reviewer B IMPORTANT-2)

Change (disputes.service.ts list()):
```ts
const result = await this.db.transaction(async (tx) => {
  const rows = (await tx.execute(pageSql)) as ...;
  const disputes = rows.map(...);
  const countRows = (await tx.execute(countSql)) as ...;
  return { disputes, total: countRows[0]?.c ?? 0, page, perPage };
});
return result;
```
`db.transaction` with drizzle postgres-js accepts
`this.db.transaction(cb, { isolationLevel: 'repeatable read' })` — pass it so both reads
share one snapshot (sweep writes mid-list no longer flip total vs page).

**Type contract:** `db.execute` returns rows array (postgres-js style) — the service already
casts `as unknown as Array<...>`; keep identical casts inside the tx.

**Spec updates (sla-list.spec.ts):**
- mock db gains `transaction: jest.fn((cb) => cb(executor))` where executor mirrors the old
  execute mock (COUNT-shape branch).
- new pin: "page and count run inside ONE transaction (snapshot isolation)" — asserts
  transaction was called AND both statements rendered through the executor share the same
  WHERE text (escalated filter present in both when sla=escalated).
- remove dead `appealTiebreak` (Reviewer A MINOR-2); assertion stays on `appealTail`.

### Acceptance criteria
- [ ] Lane diff touches ONLY: earnings page.tsx, en.json, ar.json (+ optional csv-export type
      additions if the two-call variant needs them — none expected).
- [ ] Parent diff touches ONLY: disputes.service.ts, disputes.sla-list.spec.ts.
- [ ] i18n parity 699/699.
- [ ] All gates green (build 3/3, admin tsc 0, api jest disputes suites pass, PWA vitest
      all-pass grep-verified).
- [ ] Live: admin console /en/partner/earnings renders the button; API probe
      `/api/v1/partner/earnings` (partner seed token) 200 unchanged shape.
