# Program Design — Wallet Top-up Production Gate (P0-2 interim)

## Contract

### API — POST /wallet/topup

**Request** (unchanged): `{ amount: number (1..10000), referenceId?: string, idempotencyKey: string }`

**Responses:**

| Condition | Status | Body |
|---|---|---|
| NODE_ENV != production, valid body | 201 | `{ ledgerEntry: {...}, wallet_balance: string }` (unchanged) |
| **NODE_ENV = production** | **403** | `{ message: "Wallet top-up is disabled in production until a payment provider is integrated", error: "Forbidden", statusCode: 403 }` |
| Unauthenticated | 401 | (guard, unchanged) |

### PWA — wallet page top-up submit

**Hook** `useTopupWallet()`: unchanged (optimistic credit + rollback onError already correct).

**Page** `handleTopUpSubmit` onError:
- Inspect `error` (FetchError). If `status === 403` → `setTopUpError(t('wallet.topupDisabled'))`
- else → existing `t('common.error')`

### i18n keys

| Key | en | ar |
|---|---|---|
| `wallet.topupDisabled` | "Wallet top-up is temporarily unavailable. Please try again later." | "الإيداع في المحفظة غير متاح مؤقتاً. يرجى المحاولة لاحقاً." |

## Contract verification checklist

- [ ] API: prod env → 403 with exact message; dev env → unchanged 201 + full ledger entry
- [ ] PWA: FetchError.status surfaces 403; page renders topupDisabled message; rollback intact
- [ ] i18n: key exists in both en.json + ar.json
- [ ] Build: `turbo run build` zero errors; jest + vitest green
