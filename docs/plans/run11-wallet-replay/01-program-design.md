# Run #11 Cycle — Wallet replay idempotency (P2-10)

## Gate 0 — Retrospective (compact)

Area audited: `apps/api/src/modules/wallet/wallet.service.ts`, `wallet.controller.ts`, related board items.

- Prior art: run #4 (3377567) moved the idempotency check INSIDE the tx (TOCTOU fix) — correct
  concurrency, but the collision path throws `ConflictException` (wallet.service.ts:56-58).
- Why that's wrong: an idempotency key exists so the SAME logical payment retried by a webhook
  returns the SAME result. 409 forces every retry path to special-case conflict handling; a
  payment-provider webhook treats non-2xx as failure and keeps retrying forever.
- Tech-debt scan of the area: `getBalance`/`pay` fine; controller hardcodes `type:'CREDIT'`,
  `referenceType:'TOPUP'` (:74-80) — noted, not touched (contract surface).
- Verification of this run's other candidates: t_546c5bc1 STALE (unban verb fixed, users.service.ts:191);
  P2-12 sites now stylistically uniform (cosmetic, stays TODO); reviewer A's seed-phone finding was a
  FALSE POSITIVE caused by display-masking of phone values in tool output (DB + files store real
  numbers — od -c proof in run report).

## Gates 1–3 — Program design (compact, single doc)

**Problem:** webhook/API retry with the same idempotency key gets 409 + "Duplicate transaction"
instead of the original result.

**User story:** As a payment provider retrying a top-up webhook, I resubmit with the same
idempotency key and receive the original transaction result (HTTP 200) so the retry loop ends
and the user is never double-credited or shown an error.

**Scope:**
- IN: `recordTransaction` replay path returns `{ ledgerEntry: <original row>, wallet_balance:
  <current balance>, replayed: true }`; fresh inserts return `replayed: false`; jest specs.
- OUT: schema changes (no balance-snapshot column), controller DTO changes, `/wallet/pay` flow.

**Architecture delta:** single method, no new modules. Replay path selects the full original row
(one query, already inside the tx) instead of `{id}` + throw.

**Exact response shapes:**
- Fresh: `{ "ledgerEntry": { ...full transactions row, amount: string }, "wallet_balance": "105.00", "replayed": false }`
- Replay: `{ "ledgerEntry": { ...same row as original call }, "wallet_balance": "<current>", "replayed": true }`

**TS signature (unchanged public shape, additive field):**
`recordTransaction(userId: string, entry: LedgerEntryDto): Promise<{ ledgerEntry: Transaction; wallet_balance: string; replayed: boolean }>`

**Contract verification checklist (Gate 3):**
- [✓] No endpoint contract breaks: response keeps `ledgerEntry` + `wallet_balance`; `replayed` is additive.
- [✓] Frontend consumers (`useWallet.ts`, wallet page) read named fields only — additive key safe.
- [✓] No migration; `idempotency_key` unique index already exists (P2-9/run #4).
- [✓] Replay returns balance AFTER the original credit (current balance) — never implies double-credit.
- [✓] i18n: no user-facing strings added (API-only).
- [✓] Observability: replay path logs one Pino warn line (wire via existing logger pattern in service — if the service has no logger injected, skip rather than expand scope; count via tests instead).

**Decision:** build now (small, no external deps, finishes inside the run-#11 window).
