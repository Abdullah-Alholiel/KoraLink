# Retire legacy dummy top-up (P2-331) — compact gates 0–3 (run #197)

## Gate 0 — Retro (evidence)
- Reviewer A run #197 latent **CRITICAL**: legacy `POST /wallet/topup` (wallet.controller.ts:160-186)
  client-priced self-credit (amount 1–10000 + client idempotencyKey) gated ONLY by
  `WALLET_TOPUP_ENABLED` — the SAME flag `wallet.topup.service.enabled` uses for the REAL Moyasar
  flow (wallet.topup.service.ts:99-100). Enabling real top-ups (owner-approved sandbox test
  D-20261106-04, then prod go-live) re-opens free money minting with NO @Throttle
  (routes :53-144 throttled, :160 is not).
- Route comment admits it: "Real payments replace this path when P0-2 ships" — P0-2 SHIPPED
  (Moyasar intent/verify live since run #169-era; PR #185).
- Direct precedent: run #58 removed `POST /wallet/pay` (client-priced MATCH_FEE surface) with a
  "stays REMOVED" pin spec (wallet.controller.spec.ts:92).
- `recordTransaction()` production callers after removal: ZERO (only specs). Service method STAYS
  (canonical ledger writer for any future server-side credit).
- DECISIONS.md: nothing mandates keeping the dummy path; D-20261106-04 approves sandbox testing
  via the REAL Moyasar flow.

## Gate 1 — Product
- Problem: enabling real payments re-opens a client-priced credit hole; flag-off players see a
  fake credit form instead of a truthful disabled state.
- Stories: (1) operator enables WALLET_TOPUP_ENABLED → only Moyasar intent/verify exist;
  (2) flag-off player taps Top-Up → localized "top-up unavailable" state, no fake form.
- IN: route+DTO removal (API), controller spec rewrite (gate→removal pin), dto-caps cleanup,
  reconcile sweep ASC flip (Reviewer A IMPORTANT — oldest-pending starvation), PWA hook + dummy
  modal removal, Top-Up button routes ONLY to TopupSheet (enabled=false → localized notice),
  tripwire specs both sides.
- OUT (boarded/owner): Moyasar webhook P2-325, intent-cap P2-3xx follow-up, receipt P2-145/311,
  per-user pending-intent cap, SSE auto-verify.

## Gate 2 — Architecture (files)
- API: wallet.controller.ts (route+import out), dto/topup-wallet.dto.ts DELETED,
  wallet.controller.spec.ts (flag-gate describe → removal pin + config/intent/verify unchanged),
  dto-caps.spec.ts (TopupWalletDto block out), wallet.reconcile.service.ts (desc→asc + comment).
- PWA: useWallet.ts (useTopupWallet export out), wallet/page.tsx (dummy modal block, topup hook
  usage, handleTopUpSubmit, flag branch out; button → always TopupSheet),
  TopupSheet.tsx (`enabled?: boolean` prop; false → notice using existing `wallet.topupDisabled`),
  test/hooks/useWallet.test.tsx (dummy describe → export-absence pin),
  test/app/wallet-error-states.test.tsx (403-dummy case → disabled-surface case).
- i18n: NO new keys. Surgical removals (namespace-scoped, I18N TRAP): wallet.topUpAmount,
  wallet.topup.amountHint, wallet.topup.quickAmounts — grep consumers repo-wide first.
  wallet.topupDisabled STAYS (now the flag-off surface).

## Gate 3 — Contracts
- POST /wallet/topup → 404 forever (tripwire pin).
- GET /wallet/topup/config unchanged {enabled, minAmount, maxAmount} (enabled=false when flag off).
- POST /wallet/topup/intent + /verify unchanged (403 when disabled, provider-authoritative credit).
- PWA: useTopupWallet gone from module exports (tripwire); TopupSheet props +{enabled?: boolean}.
- Reconcile sweep: pending scan ORDER BY created_at ASC (oldest first) LIMIT 200.

## Slices
1. API: route/DTO removal + spec rewrite + reconcile ASC → jest + tsc green.
2. PWA: hook/page/TopupSheet + spec updates → vitest + tsc green.
3. Gates: turbo 3/3 → lane branch → PR → PR-Agent triage → squash → rebuild+restart → live probes.
