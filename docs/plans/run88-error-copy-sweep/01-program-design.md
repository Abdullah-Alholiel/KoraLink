# Run #88 — Program Design: P2-127 Error-Copy Sweep (Gates 1–3 compact)

## Problem
Nine user-facing error surfaces render the flat generic `common.error` ("Something went
wrong") with no what-happened / why / what-next structure, violating the error-message
standard (docs/plans/error-message-standards/, 2026-09-06, Abdullah) while the `errors.*`
namespace (28 keys, EN+AR parity) already carries the authored copy. `lib/error-classify.ts`
(classifyError → errorKey) maps any FetchError to the right key; the reports page (P2-63)
is the migrated reference.

## User story
As a player, when a screen fails to load or an action fails, I see a specific, localized
message telling me what happened, why, and what to do next — in Arabic or English.

## Scope
IN: migrate 9 bare `t('common.error')` sites (7 files) to `errorKey(classifyError(err))`
copy; migrate the my-games structure test that pins the old copy; add a structure test
pinning the new standard (no bare common.error in user-facing render/mutation paths).
OUT: backend, schema, new i18n keys beyond none needed (28 exist), offline queue, SW,
admin, match-detail realtime (separate boarded items).

## Exact site map (grep-verified 2026-09-30 @ 9718510)
| # | File:line | Current | Becomes |
|---|-----------|---------|---------|
| 1 | src/app/[locale]/(main)/clubs/page.tsx:224 | `t('common.error')` as heading + `common.errorDescription` para | `t(errorKey(classifyError(error)))` (heading) + drop generic para |
| 2 | src/app/[locale]/(main)/my-games/page.tsx:96 | `t('common.error')` + `common.errorDescription` | same pattern |
| 3 | src/app/[locale]/(main)/play/page.tsx:244 | `t('common.error')` + `common.errorDescription` | same |
| 4 | src/app/[locale]/(main)/profile/page.tsx:188 | walletError ternary → `t('common.error')` | status===0 → errors.network else errorKey(classifyError(walletError)) |
| 5 | src/app/[locale]/(main)/profile/page.tsx:335 | `t('common.error')` (push sheet error) | errorKey(classifyError(err)) — page already has `te = useTranslations('errors')` |
| 6 | src/app/[locale]/(main)/personal-info/page.tsx:76 | mutation onError toast `t('common.error')` | `t(errorKey(classifyError(err)))` |
| 7 | src/app/[locale]/(main)/personal-info/page.tsx:141 | load-error para `t('common.error')` | errorKey(classifyError(error)) |
| 8 | src/app/[locale]/(main)/wallet/page.tsx:236 | balanceError para `t('common.error')` | errorKey(classifyError(balanceError)) |
| 9 | src/app/[locale]/match/[id]/page.tsx:256 | `t('common.error')` (detail load error) | errorKey(classifyError(error)) |

## Contract (Gate 3)
- TS: `import { classifyError, errorKey } from '@/lib/error-classify'` (existing exports,
  no lib changes). `errorKey(classifyError(e))` returns e.g. `'errors.server'`; pages use
  ROOT-scope `t = useTranslations()` so `t(errorKey(...))` resolves (proven in reports/page).
- i18n: ZERO new keys — all 28 `errors.*` keys exist with exact EN+AR parity (1003/1003
  leaf keys re-verified by Reviewer B this run).
- Test: REPLACE the pinning of `common.errorDescription` in
  test/structure/pwa-a11y-labels.test.ts (my-games case) with a pin of
  `errorKey(classifyError` in my-games + a sweep test asserting NO
  `t('common.error')` render/mutation sites remain in src/app (exclusions: none in src/app).
- Verification: `npx turbo run build --concurrency=1` 3/3 + `npx vitest run` green
  (grep "Test Files") + `npm run type-check` (CI tsc covers test/).

## Contract checklist
- [x] No backend endpoints touched → mutation-contract rule N/A
- [x] Frontend consumes existing error-classify exports (types line up)
- [x] Every classified key has EN+AR entries (parity verified this run)
- [x] No field silently undefined (error objects flow as-is)
- [x] No new i18n keys needed; none added
