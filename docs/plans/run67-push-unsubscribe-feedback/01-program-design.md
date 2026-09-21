# Run #67 — Push unsubscribe feedback (P2-87) — Gates 1–3 compact

## Gate 1 — Problem & scope
**Problem:** Tapping the notifications toggle to turn pushes OFF can silently fail: `usePushNotifications.unsubscribe()` catches errors, ships them to Sentry, console.errors — and resolves quietly (`usePushNotifications.ts:176-179`). The profile page fires it bare (`profile/page.tsx:428`) with no pending state and no failure feedback. A user who believes pushes are off keeps receiving them — trust + expectation violation on a money-adjacent surface (match reminders, cancellations). Violates the error-message standard (what happened + why + what to do next) and the 5-UX-states standard (no error/pending state on the mutation).
**User story:** As a player, when I switch notifications off, I want the switch to reflect reality — and if the network fails, I want to be told to try again, not left with silent pushes.
**IN:** hook returns `isUnsubscribing`; unsubscribe failures surface a localized `errors.pushUnsubscribeFailed` toast (what/why/next). **OUT:** re-subscribe UX changes, server-side unsubscribe semantics, admin surfaces (ADMIN HOLD).

## Gate 2 — Architecture delta
Files: `apps/player-pwa/src/hooks/usePushNotifications.ts` (isUnsubscribing state + failure return contract), `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx` (toast on failure + disabled/pending spinner), `apps/player-pwa/src/messages/en.json` + `ar.json` (1 new key each), `apps/player-pwa/test/hooks/usePushNotifications.test.tsx` (2 new cases).
Data flow: profile toggle → `unsubscribe()` → POST /notifications/unsubscribe (existing) → on throw: hook returns `false`, page toasts `errors.pushUnsubscribeFailed`; on success: existing behavior unchanged.

## Gate 3 — Contracts (CRITICAL gate)

### Hook contract (TS signatures)
```ts
const unsubscribe: () => Promise<boolean>;   // was: Promise<void> (implicit)
// resolves true  — server row deleted, browser sub released, marker cleared
// resolves false — any failure; captureError already shipped it to Sentry
const isUnsubscribing: boolean;              // in the hook's return object
```

### i18n keys (both locales, leaf count +1 each side)
- `errors.pushUnsubscribeFailed`
  - en: "We couldn't turn notifications off — you may still receive pushes. Check your connection and try again."
  - ar: "لم نتمكن من إيقاف الإشعارات — قد تستمر الإشعارات بالوصول. تحقّق من اتصالك وحاول مجددًا."

### UI wiring
- Toggle MenuItem onClick: `setIsUnsubcribing`-driven spinner reuses the existing `isSubscribing` icon slot pattern → `isSubscribing || isUnsubscribing` for the spinner; while `isUnsubscribing`, the onClick is a no-op (double-tap guard).
- On `false`: `showToast(t('errors.pushUnsubscribeFailed'), 'error')` — store toast (wallet/page.tsx:77 pattern).

### Gate 3 verification checklist
- [x] Mutation endpoint unchanged (POST /notifications/unsubscribe, run #65) — no backend contract change.
- [x] Hook return type widened additively (`isUnsubscribing` + boolean return); existing consumers compile (only profile/page.tsx:428 calls it).
- [x] Toast path exists: `useAppStore.getState().showToast` (slices.ts:170); page-level selector pattern proven (wallet/page.tsx:77).
- [x] No field silently undefined: failure path returns explicit `false`, never throws past the hook.
- [x] i18n keys added to BOTH en.json and ar.json; parity test (`test/i18n.test.ts`) enforces equal leaf counts.
- [x] ADMIN STATE CHECK: zero admin/partner files touched (ADMIN HOLD intact).
