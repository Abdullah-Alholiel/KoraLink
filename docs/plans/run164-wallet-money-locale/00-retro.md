# Run #164 — Gate 0 Retrospective: PWA Screens (164 % 4 = 0)

**Build pick:** P2-257 (NEW this run) — wallet money localization + balance-error retry.

## Why this item
Reviewer B's design lens flagged the wallet page (player money surface, wallet/page.tsx)
rendering `balance.toFixed(2)` (:254) and `txn.amount.toFixed(2) ﷼` (:386) — Latin digits
everywhere + a hardcoded currency glyph, while:
- DECISIONS.md 2026-09-08: "Marketing = EN+AR always (Tajawal, RTL, Arabic-Indic numerals)".
- lib/format.ts `formatMoney` is the canonical helper since P2-128 (run #93); profile page
  already routes through it (run #112) — wallet was missed.
- The `﷼` glyph census: wallet txn row is the ONLY live use in the PWA src tree.
- The wallet balance error path (:246) shows classified copy with no recovery action —
  violates the error-message standard (what/why/**what-next**).

## Premise-corrections found this run
- **P2-181 stale DONE**: board claimed TODO, but commit e2e0a74 (PR #120) localized all 5
  success toasts via `tMatch(...)`; both reviewers + parent confirmed keys exist EN+AR.
  Close as DONE with evidence.
- P2-253/P2-252-2 run-#162 claims re-verified by Reviewer B as CONFIRMED (BlackoutPanel
  gate `endpointBase === '/partner'`, EmptyState brand tokens).

## Tech-debt audit of the pick area
- `formatMoney` contract: EN `SAR150.00` byte-identical to history; AR `١٥٠٫٠٠ ر.س.‏`
  (Arabic-Indic digits, ر.س.‏ symbol). Test-pinned in test/lib/format-money.test.ts.
- `ErrorState` (P2-247 components, run #159) is presentational (title/onRetry/retryLabel).
- `common.retry` exists both locales.
- toFixed money renders ALSO exist on PaymentSheet (×4), CostFooter (:43), PublishWarningSheet
  (×4) — DIFFERENT flows (payment/host/publish). Not drive-by — those sheets pin "SAR {x}"
  formats in their own specs. Recorded as a follow-up row (P2-257b), never preemptive.
- Residual documented in P2-247's row: EmptyState description token text-gray-400 —
  intentional (PWA secondary-text convention, documented run #162).

## DECISIONS.md Gate-0 read
No contradiction: the wallet fix ENFORCES the 2026-00-08 EN+AR numerals entry; no design/UX
decision this run touches a ledger row (drawer side untouched; bell stays feed-only).

## Full-stack connectivity audit (pick area)
- Hook→API: useWalletBalance returns `{ balance: number, currency: 'SAR' }` (adapter
  toNum on the raw string); useWalletHistory → adaptWalletHistory (amount: number).
- Page→User: action buttons all carry onClick; no dead UI found by both reviewers.
- DB→API→UI: adapter guarantees `amount` is number — formatMoney(value) is safe; no
  NaN path (formatMoney has no finite-guard; adapter toNum coerces — fine).
