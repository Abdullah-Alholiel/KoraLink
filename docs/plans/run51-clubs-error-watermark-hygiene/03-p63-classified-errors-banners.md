# Run #51 — P2-63: classified error copy + OfflineBanner coverage (Gate 0 was shared; compact Gates 1-3)

## Gate 1 — Product spec (compact)
- **Problem (Reviewer B, run #51):** two error states render generic copy instead
  of the run-#38 owner standard ("what happened + why + what to do next",
  localized): ChatSheet (`common.errorDescription`) and reports (`t('error')`);
  and OfflineBanner was claimed missing on 4 primary surfaces.
- **User story:** as a player, when a screen fails to load I see a message that
  tells me what happened and what to do — in my language; when my connection
  drops I see an offline signal, not silent staleness.
- **IN:** classifyError copy in ChatSheet + reports; banner on genuinely missing
  surfaces; specs.
- **OUT:** nothing else — banner claim re-scoped on inspection (7 of 9 claimed
  surfaces already had the banner; real gaps: profile, personal-info only).

## Gate 2 — Architecture (compact)
| File | Change |
|---|---|
| src/components/matches/ChatSheet.tsx | +import error-classify; error line → `t(errorKey(classifyError(error)))` |
| src/app/[locale]/(main)/reports/page.tsx | +import; +root-scope `terr`; error line → classified copy |
| src/app/[locale]/(main)/profile/page.tsx | +useOnlineStatus +OfflineBanner (mx-4 mt-2) above the hero |
| src/app/[locale]/(main)/personal-info/page.tsx | same pattern, above the pinned header |
| test/components/ChatSheet.test.tsx | CS-6 reworked (unknown-class copy) + CS-6b (503 → errors.server) |
| test/app/reports-error.test.tsx | NEW: RPT-1 (FetchError status 0 → errors.network + retry wired), RPT-2 (502 → errors.server) |
| test/components/ProfilePage.test.tsx | +useOnlineStatus mock (re-seeded after resetAllMocks) + banner null/shown pair |
| test/components/PersonalInfoPage.test.tsx | same pair + phone fixture fixed (masked literal → numeric + shape predicate) |

No API/DB/i18n surface changes (all `errors.*` keys already exist EN+AR —
Reviewer A run #51 verified parity programmatically).

## Gate 3 — Contract checklist
- [x] Mutations — N/A (render-state only).
- [x] Shapes/adapters — N/A.
- [x] No silently-undefined fields — N/A.
- [x] i18n keys both languages — `errors.network|server|unknown|...` present EN+AR
      (programmatic parity verified by Reviewer A this run); zero new keys needed.
- [x] No dead UI — retry buttons wired to real refetches (asserted in CS-6/RPT-1).
- [x] 5 UX states — error state copy now classified on both surfaces.
- [x] Redaction hygiene — the PersonalInfoPage phone fixture carried a masked
      literal (`+966****0001` — an artifact of an earlier session's copy from
      redacted tool output). Replaced with a numeric seed-shaped value asserted
      via a `/^\+966\d{9}$/` predicate; no phone literal in the test source.

**Gate 3 → Gate 4: PROCEED (autonomous mode).**

## Gate 4 — slices
- Slice 1: ChatSheet + reports classified copy (CS-6/6b, RPT-1/2).
- Slice 2: profile + personal-info OfflineBanner pairs (PRF/PIF specs).
- Verification: 4 touched suites 27/27 → full gates below.

## Gates (actuals)
- 4 suites: 27/27 green.
- Full PWA vitest: 78 files / 530 tests green.
- `npm run type-check` (CI parity, test/ included): 0 errors.
- `npx turbo run build`: 3/3 exit 0.
