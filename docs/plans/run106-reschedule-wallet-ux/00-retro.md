# Run #106 — Reschedule wallet-shortfall error UX (PWA error-message standard)

**Lane:** Admin rotation (106%4=2) — but every admin-area board row was DONE/owner-gated/
veto-held, so the run defaulted to the strongest live user-visible item. This slice is the
run's user-visible item.

## Gate 0 — Retrospective (what this touches)

- Run #105 (PR #85, 77bd739) added a guarded wallet floor to `rescheduleMatch`: zero-row
  UPDATE → 400 `Insufficient wallet balance for the reschedule. Required: SAR X, Available: SAR Y`.
- That 400 today lands in `useRescheduleMatch().onError` → generic `errors.rescheduleFailed`
  toast = **"the slot may have been taken"** — actively misleading for a wallet cause, and no
  top-up guidance (violates the owner error-message standard: what happened + why + what next,
  localized EN+AR).
- `parseWalletShortfall()` already parses this message shape (regex `/insufficient wallet
  balance/i` + `Required: SAR` / `Available: SAR`) — the docstring's "(e.g. the reschedule
  variant without \"wallet\")" note is stale; the regex matches today's message.
- Admin state check (mandatory, run #106): `git status apps/admin + partner/admin modules` →
  **clean**; `koralink-admin.service` active; recent admin commits reviewed (9891e46/749b915/
  92639cc). No owner WIP → admin lane GO (but nothing buildable remained there).
- DECISIONS.md consulted: no contradiction (error-message standard is itself a ledger entry —
  what/why/what-next, EN+AR).

## Gates 1–3 (compact)

- **Problem:** hosts rescheduling a paid move see a wrong "slot taken" toast when the real
  cause is wallet shortfall — no "why", no "what next", trust risk mid-money-flow.
- **Scope:** PWA only. `useRescheduleMatch().onError` gains the classify-first branch.
  API unchanged (the 400 already carries the exact Required/Available amounts — by design
  from run #105). No DB. No admin.
- **Contract (Gate 3):**
  - `useRescheduleMatch` onError: `parseWalletShortfall(msg)` hit → toast message =
    `t('rescheduleWalletShortfall', { amount: s.shortfallSar.toFixed(2) })` with detail
    `t('rescheduleWalletDetail')`; else current behavior unchanged (`rescheduleFailed` +
    kindDetail).
  - i18n keys `errors.rescheduleWalletShortfall` + `errors.rescheduleWalletDetail` in
    en.json + ar.json (leaf parity stays equal; amounts via `{amount}` interpolation,
    Latin digits in both locales — matches `host.shortfallBody` and wallet-page precedent).
  - Observability: `trackEvent('reschedule_blocked_insufficient_balance', { required_sar,
    wallet_balance_sar, shortfall_sar })` on the branch (PostHog sizing funnel).
- **Contract checklist:**
  - [x] No API/DB changes → mutation-contract rules N/A.
  - [x] Frontend types: `parseWalletShortfall` import reused; no new types.
  - [x] i18n keys exist in BOTH locales before build.
  - [x] Test pins the toast text + detail + event payload on a synthetic 400 whose message
        matches the API's exact template.

## Gate 4 — Slices

1. Slice 1 (only): hook branch + 2 i18n keys ×2 locales + tests → `turbo build` + vitest green.
