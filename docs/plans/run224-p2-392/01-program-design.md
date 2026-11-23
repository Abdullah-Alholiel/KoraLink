# Run #224 — P2-392 — Gates 1-3 (compact)

## Gate 1 — Product spec

**Problem**: 408 tap-target instances below the 44px WCAG 2.5.8 floor outside the run-#215
sheet census (P2-371 real-browser baseline Finding 2), including the PWA install banner's
20×20px "not now" dismiss (the primary escape hatch at 20px), geolocation pill (28px), host
onboarding dots (8×8), and 20px-tall search/phone inputs. Privacy/terms back buttons are
unlabeled icon-only controls.

**User stories**
- P0: As a user with motor difficulty, every dismiss/close/escape control is reachable at
  ≥44×44px without precision tapping.
- P1: As a screen-reader user, the privacy/terms back buttons announce "Go back" / "رجوع".
- P2: As a user, search inputs and language pills have comfortable touch height.

**Scope**: PWA classes only — hit tokens (`min-h-hit`/`min-w-hit`) or height bumps; 2 new
i18n leaf keys (legal.backAria EN+AR). OUT: P2-391 stacking, NEW census surfaces beyond the
listed files, API/admin.

**Success criteria**: census tripwire passes with KNOWN_DEBT = {} (zero tolerated compact-
no-hit buttons repo-wide); full vitest green; turbo build green; type-check 0.

## Gate 2 — Architecture

Pure className/aria edits across 17 files (15 debt + audit offenders + 2 legal pages) +
`test/p2366-tap-targets.test.ts` ratchet → `{}` + `src/messages/{en,ar}.json` legal ns.
No data flow, no API, no z-index, no layout reflow beyond intended height bumps (pill/
segment/dot geometry grows 4-8px; no sibling depends on the old heights).

## Gate 3 — Program design (contracts)

- **Components (all render-only)**: add `min-h-hit min-w-hit` to w-8/w-9/w-10 compact buttons
  (visual size unchanged, target grows to 44); InstallPrompt X + geolocation dismiss get hit
  tokens; geolocation Enable + onboarding dots + LanguageToggle get height bumps
  (dots 2→3, md-segment 32→36, md-container 40→44); phone/email/search inputs get `min-h-hit`
  (parent containers already ≥48px; input becomes the full-height target).
- **i18n**: `legal.backAria` = "Go back" / "رجوع" — pages already bind `useTranslations('legal')`,
  so call sites use `t('backAria')` (NOT `t('legal.backAria')` — the i18n-literal-keys
  tripwire enforces this).
- **Test contract**: `KNOWN_DEBT = {}`; the "no NEW compact button lacks hit tokens" test now
  asserts the empty registry over the whole scan dirs; ordering/size-shorthand/breakpoint
  logic untouched.
- **TS signatures**: none change.

### Contract verification checklist
- [x] Render-only changes — no props/state/hook signatures touched.
- [x] Every added class exists in the Tailwind config (`hit: '44px'` token).
- [x] i18n keys added in BOTH locales, referenced via the correct namespace (tripwire-pinned).
- [x] Census test updated to the stricter ratchet and passing.
- [x] No z-index/positioning changes (classes only extend min-sizes).
