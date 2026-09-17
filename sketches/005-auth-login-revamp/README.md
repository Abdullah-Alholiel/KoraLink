# 005 — Auth Login Revamp: channel affordance

**PICKED: Variant A — segmented Phone/Email pills under the title** (Abdullah, 2026-09-17).

Shipped in `login/page.tsx` as `[data-testid="channel-selector"]`:
`role="group"` + localized `aria-label` (`login.channelSelector`), two
`aria-pressed` segments (`login.channelPhone` / `login.channelEmail`),
active = `bg-brand-green` pill + white text, 44pt hit target, RTL-native
(flex order mirrors automatically). Old bottom text-toggle (`emailToggle` /
`phoneToggle`) REMOVED — keys kept in i18n as harmless legacy.

Verified live on :3000 (`sketches/_render/verify-designA.js`): 24/25 checks
EN+AR (the 1 "fail" was the probe reusing a session where the email channel
was intentionally persisted across a locale switch; fresh-visit default =
Phone, confirmed separately).
