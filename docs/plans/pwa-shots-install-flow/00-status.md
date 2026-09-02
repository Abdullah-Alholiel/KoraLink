# PWA shots.so Install Flow — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED (autonomous mode — "continue in best standard") | auto | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED (autonomous) | auto | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED (autonomous) | auto | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED (autonomous; contract checklist in doc) | auto | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🔄 IN PROGRESS | — | slices below |

## Vertical slices

- **Slice 1 (tracer bullet):** install landing overlay + guard + hook extension,
  EN only — end-to-end: browser visit → landing → CTA → prompt → handoff. Gate: build green.
- **Slice 2:** i18n (ar RTL, exact 19+3 keys) + welcome checkpoint + 10s safety net.
- **Slice 3:** manifest hardening (screenshots via CDP capture, orientation, display_override,
  background_color #254132, prefer_related_applications) + spring motion tokens.
- **Slice 4:** tests (guard matrix, welcome once-only, hook 30d flag) + headless verification
  (browser / → landing; standalone → no landing; splash color probe; ar/en DOM) + commit/push.

## Completion (2026-09-01, run #25)

All slices DONE. Post-drift recovery found and fixed three defects:
1. **Hook staleness bug** — `appinstalled` removed the welcome flag but
   `setHasSeenAppBefore(false→false)` is a React no-op, so `shouldShowWelcome`
   stayed stale. Fixed with a real `welcomeCleared` state bit. (Test: 19/19.)
2. **Manifest spec violation** — screenshot `label` was `{en, ar}` object; spec
   requires a string. Fixed to EN strings. Screenshots captured from the live
   Play page at exact manifest dimensions (1440x900, 800x1200).
3. **Structure-guard violation** — `InstallLanding` rendered a fixed overlay
   without `<Portal>` (iOS stacking-context bug class). Wrapped in Portal.

Verification: 272/272 unit tests; `turbo run build` 3/3 tasks exit 0; live
headless flow gates ALL PASS (browser→landing overlay, 30d-dismissed skip,
standalone skip, 'Not now' persists flag). Committed and pushed.

## Post-cycle correction (2026-09-02, owner-reported)

The marketing landing's install band and the in-app intercept SHARED
`koralink.install-landing-dismissed-at` — tapping "Continue" on the band
suppressed the in-app install landing for 30 days (owner: "I can't feel the
embedded CTA"). Supersedes the Gate 3 §1 key contract:

- Intercept owns `koralink.install-landing-dismissed-at.v2` (30d).
- Old key = read-only returning-user evidence (LEGACY_EVIDENCE_KEYS).
- Band writes `koralink.landing-band-dismissed-at`; continue links never
  dismiss anything.
- Landing drafts: bell removed; segmented visual toggles (theme/lang/edition,
  active = accent fill); partner draft standardized to player type system
  (Outfit/Albert Sans). Commits bacc9a1, 68896eb.
