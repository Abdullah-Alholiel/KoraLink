# P2-393 a11y quartet — Gates 1-3 compact (run #222)

## Problem (Gate 1)
Four named interactive controls fail the project's own a11y standards: an unnamed icon-only
avatar-edit button, an unlabeled hero back button, a chat button that borrows an unrelated
label ("Messages"), and one sheet close below the 44px target standard. Screen-reader users
get silence or wrong labels on high-traffic match/auth surfaces.

## Scope
IN: the 4 sites + census ratchet update + 1 new i18n key (EN+AR).
OUT: P2-392 batch (install banner, locale pills, search inputs, favorites…), chat button
hit-area beyond this one line, any sheet outside AppealSheet.

## Contract (Gate 3)
- No API/DB changes. Render-only a11y.
- i18n contract: `chatSheet.openAria` — EN "Open match chat" / AR "افتح محادثة المباراة";
  leaf parity 1325=1325 → 1326=1326 both locales. Reused keys: `common.back` (exists),
  `completeProfile.uploadAvatar` (exists) — zero new keys beyond openAria.
- Census contract: KNOWN_DEBT loses exactly 2 entries (AppealSheet, complete-profile);
  `toEqual` keeps every other file's count pinned.

## Files changed (Gate 2)
| File | Change |
|---|---|
| apps/player-pwa/src/components/matches/AppealSheet.tsx:50 | +min-h-hit min-w-hit |
| apps/player-pwa/src/app/[locale]/(auth)/complete-profile/page.tsx:123 | +aria-label=t('uploadAvatar') + invisible min-h-hit/min-w-hit target (inner span keeps visible 32px badge) |
| apps/player-pwa/src/app/[locale]/match/[id]/page.tsx:356-363 | back: aria-label=t('common.back') + rtl flip check; chat: aria-label=t('chatSheet.openAria') + min-h-hit min-w-hit |
| apps/player-pwa/src/messages/{en,ar}.json | chatSheet.openAria (surgical insert after openFullThread) |
| apps/player-pwa/test/p2366-tap-targets.test.ts | drop 2 KNOWN_DEBT entries |

## Verification checklist
- [ ] vitest full suite green (census passes with the reduced KNOWN_DEBT)
- [ ] pwa type-check 0 errors (CI tsc covers test/)
- [ ] turbo build 3/3 sequential
- [ ] JSON parity machine-check 1326=1326
