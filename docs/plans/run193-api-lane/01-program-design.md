# Run #193 — Program Design (Gates 1-3 compact)

## Item 1 — P2-318: audit-list pagination contract (Reviewer A #193 IMPORTANT)

**Problem:** audit trail pages are unstable — `ORDER BY a.created_at DESC` with no
unique tiebreaker duplicates/skips rows across page fetches when timestamps collide
(bulk admin actions stamp the same ms); the endpoint also runs a second full
`COUNT(*)` scan per page read.

**User story:** as HQ admin I page the immutable audit trail and each row appears
exactly once; as ops the list endpoint costs one query, not two.

**Contract shape (unchanged externally):** `{ logs, total, page, perPage }` —
`total` now rides the page query as `COUNT(*) OVER()::int` (window count taken
BEFORE LIMIT). Helper column `total_count` stripped from the response rows.

**Exact SQL delta (audit-list.service.ts):**
- `ORDER BY a.created_at DESC, a.id DESC` (unique tiebreaker on the varchar(36) PK).
- `COUNT(*) OVER()::int AS total_count` in the SELECT list; drop the second query.
- Destructure-strip `total_count` from each row before returning.

**Files:** apps/api/src/modules/admin/audit-list.service.ts (only),
apps/api/src/modules/admin/audit-list.pagination.spec.ts (new tripwire, source-contract
style matching audit-list.lift.spec.ts).

**Gate 3 checklist:** response shape byte-identical ✓ · no field silently undefined ✓
(total falls back 0 on empty page, matching old countRows[0]?.c ?? 0) · mutation-return
rule N/A (read-only) ✓ · i18n N/A ✓ · `::text`/`::uuid` N/A (no id casts) ✓.

## Item 2 — P2-257b: Arabic-Indic money numerals outside wallet (Reviewer B #164)

**Problem:** PaymentSheet.tsx (:150,154,159,281), CostFooter.tsx (:43),
PublishWarningSheet.tsx (:143-186) render `toFixed` Latin digits in AR; the wallet
surface already routes through the formatMoney pattern (P2-257).

**Contract:** every money render routes through the shared formatter (exact util per
the wallet-page precedent); each touched spec's "SAR {x}" shape assertion updated to
the formatter output. ZERO new i18n keys (formatting util only). VenueReviewsSection
rating `toFixed(1)` stays (rating, not money — row marks it low priority).

**Gate 3 checklist:** formatter = existing util, no new export ✓ · spec shapes updated
per file ✓ · i18n keys unchanged ✓ · mutation contract N/A ✓.

## Verification plan (both items)
Per-item lane branch from origin/staging → commit → push → `gh pr create --base
staging` → 4 bot checks → PR-Agent triage → squash-merge. Parent gates on the real
install tree: `npx tsc --noEmit -p apps/api/tsconfig.json` (item 1), PWA
`npm run type-check` + `npx vitest run` grep Test Files (item 2), root
`npx turbo run build --concurrency=1` 3/3 after each merge. Post-merge: API/PWA
rebuilt + services restarted AFTER dist (stale-code trap), live probes.
