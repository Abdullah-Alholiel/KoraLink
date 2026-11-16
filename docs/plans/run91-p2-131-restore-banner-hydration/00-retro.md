# P2-131 — RestoreAccountBanner hydration hazard

## Retrospective

- The banner receives `purgeAt` (ISO string) as a prop and computes `daysLeft` from `Date.now()` during render (`RestoreAccountBanner.tsx:35`).
- Its current parent `profile/page.tsx` seeds `purgeAt` in a mount effect (`useEffect` reading localStorage), so the banner is NOT rendered during SSR and therefore shows no active hydration mismatch today.
- However, the component itself is impure on render: `Date.now()` during render + derived `daysLeft` recomputes on every render and would mismatch if any future caller mounts it before hydration completes. It is the same class as `DeleteAccountSheet`, which was fixed in run #84 by caller-seeding `purgeDate` post-mount.
- Fix approach: keep the component self-contained — null-seed a mount-time `now` timestamp via `useEffect`, hide the day count until seeded (render body line only), then compute `daysLeft` from the stable `now`. This makes the component robust regardless of caller and removes the latent hazard class.

## Scope

IN: `apps/player-pwa/src/components/profile/RestoreAccountBanner.tsx`.
OUT: parent page changes, API changes, i18n changes (keys already exist).

## Verification

- `npx tsc --noEmit` PWA 0 errors.
- `npx vitest run` all existing tests green + add a component test asserting no `Date.now()` in render path and stable days-left after mount.
- `npx turbo run build --concurrency=1` 3/3 tasks green.
