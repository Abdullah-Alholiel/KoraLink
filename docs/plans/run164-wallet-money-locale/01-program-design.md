# Run #164 — Program Design (Gates 1-3 compact): P2-257 Wallet money localization + balance-error retry

## Problem / user story
Arabic-first players open the wallet and see **Latin digits (100.00) + a raw `﷼` glyph** on the
player money surface, violating DECISIONS.md 2026-09-08 (EN+AR always, Arabic-Indic numerals).
The balance fetch failure leaves the player stranded: classified error copy with no way to retry
beyond leaving the page. As a player, I want my wallet to speak my locale (١٥٠٫٠٠ ر.س.‏) and a
Try Again button when the balance fails to load.

## Scope
IN: wallet page balance render + txn-amount render → `formatMoney` (lib/format.ts, canonical);
balance-error branch → shared `ErrorState` (onRetry → balance refetch, retryLabel common.retry);
tests. OUT: PaymentSheet / CostFooter / PublishWarningSheet toFixed renders (P2-257b follow-up —
they pin "SAR {x}" in their own specs; different flows); empty-history state copy (compliant);
top-up input "SAR" prefix (input affordance, not display).

## Architecture delta
Render-only. No API/DB/adapter/schema changes. `formatMoney` is locale-pure (already tested).

## Gate 3 contract (exact shapes)

### Component contract
- Balance render: `formatMoney(balance, intlLocale)` — EN `SAR100.00`, AR `١٠٠٫٠٠ ر.س.‏`.
  The adjacent `t('wallet.currency')` label span is dropped (formatMoney already carries the
  currency symbol; the duplicate label would read "SAR SAR100.00").
- Txn amount render: `formatMoney(txn.amount, intlLocale)` — EN `SAR45.00`, AR `٤٥٫٠٠ ر.س.‏`.
  The hardcoded `﷼` glyph and trailing `+/−` sign collapse into formatMoney's output; the
  credit/debit COLOR coding (`text-brand-green`/`text-brand-red`) is retained.
  EN output `SAR45.00` vs old `45.00 ﷼ −` — same information, canonical shape (the profile
  page already renders this way; both money surfaces become identical).
  The old span's `dir="ltr"` was needed for the asymmetric `45.00 ﷼` order; formatMoney's AR
  output is Intl-formed with its own directionality — the new span keeps NO forced dir
  (component tests pin both locales byte-shapes).
- Balance-error branch: shared `ErrorState` with `title={t(errorKey(classifyError(balanceError)))}`,
  `description={t('common.errorDescription')}`, `onRetry={balance refetch}`,
  `retryLabel={t('common.retry')}` — the exact play-page pattern (:246-249).
  → BUILD CORRECTION (tripwire caught it, test/structure/error-copy-standard.test.ts — P2-127):
  page files must NOT render `common.error*` copy; the classified `errors.*` title already
  carries what/why/next. Final shape = title-only ErrorState (exactly the play-page pattern).
- i18n: NO new keys (common.retry + common.errorDescription exist en.json:65-66 / ar.json:65-66;
  verified during Gate 3 — the design first assumed a new wallet key, dropped: existing keys
  suffice; nothing user-facing renders untranslated).

## Gate 3 verification checklist (explicit)
- [x] Every mutation endpoint returns fully populated object — N/A (render-only; no API change).
- [x] Frontend types accept the JSON the backend produces — N/A (adapter untouched; it already
      guarantees `amount: number`, `balance: number` via toNum).
- [x] Adapter functions exist for every API shape the frontend consumes — unchanged
      (adaptWalletBalance / adaptWalletHistory untouched).
- [x] No field silently undefined in the frontend that the backend claims to return — unchanged.
- [x] i18n keys exist for every user-facing string in both languages — common.retry +
      common.errorDescription verified in BOTH locales; no new strings introduced.

## Files changed
| File | Change |
|---|---|
| apps/player-pwa/src/app/[locale]/(main)/wallet/page.tsx | balance → formatMoney; txn amount → formatMoney; balance-error → ErrorState + retry; imports (formatMoney, ErrorState, useLocale) |
| apps/player-pwa/test/app/wallet-money.test.tsx (NEW) | 6 cases: EN balance, AR balance Arabic-Indic, EN txn, AR txn, retry fires refetch, legacy-glyph tripwire (no `﷼`/toFixed in page source) |
| kanban/BOARD.md | P2-181 → DONE (stale correction, evidence); NEW P2-257 row (BUILT); NEW P2-257b follow-up row (toFixed census) |
| kanban/STATE.json | last_run 164, in_review_items, notes append |
| docs/plans/run164-wallet-money-locale/ | 00-retro, 01-program-design, 00-status |

## Success criteria
1. `npx vitest run` green (grep 'Test Files') including the new wallet-money spec.
2. `npx turbo run build --concurrency=1` 3/3 exit 0.
3. Component tests prove EN byte-shape `SAR100.00`/`SAR45.00` + AR Arabic-Indic digits.
4. No hardcoded `﷼` remains in PWA src (census grep = 0).
