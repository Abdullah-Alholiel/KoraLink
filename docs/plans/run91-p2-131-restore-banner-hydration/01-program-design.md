# P2-131 — Program Design

## Problem

`RestoreAccountBanner.tsx:35` computes `daysLeft` from `Date.now()` during render:
```ts
const daysLeft = Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));
```
This is the same render-path clock hazard class that produced hydration mismatches elsewhere (run #84 `DeleteAccountSheet`).

## Fix

1. Add a `now` state initialized to `null`.
2. In `useEffect(() => { setNow(Date.now()); }, [])`, set it once on mount (after hydration).
3. Until `now` is non-null, render the body line without `{days}` (use `profile.restoreAccount.body` with `days: undefined` or a fallback plain string already in `common`).
4. After mount, compute `daysLeft` from `now` (stable) and render the full copy.

No changes to props, parent, or i18n keys.

## Contract

- No `Date.now()` / `new Date()` calls during render.
- Component renders without day count on first paint, then updates to the day count one frame later.
- `daysLeft` does not change between re-renders unless `purgeAt` prop changes.

## Test

Add `test/components/RestoreAccountBanner.test.tsx`:
- Render with `purgeAt` 3 days in the future.
- Assert body initially does not contain a digit (days hidden).
- Run `vi.advanceTimersByTime(0)` then assert the correct day count appears.
- Spy on `Date.now()` and assert it is called only inside the effect, not during render.
