# Gate 2 — Architecture: Match Flow & State Remediation

## Changes

| File | Change |
|------|--------|
| `MatchCard.tsx` | Wrap entire card in `<Link>`, remove inner button Link |
| `useWallet.ts` | Fix `useWalletHistory` to unwrap `{ transactions }` from API |
| `useMatchActions.ts` | Add `['user', 'my-matches']` to `invalidateQueries` |
| `match/[id]/page.tsx` | Wire "View Match Rules" → bottom sheet; wire Messages icon → chat; show `joinMatch.isPending` |
| `MatchRulesSheet.tsx` | NEW — bottom sheet component for match rules |
| `ar.json` / `en.json` | New i18n keys for rules sheet |

## Data Flow

```
Join Match:
  PaymentSheet → POST /wallet/pay → onSuccess
    → joinMatch.mutate(id) → POST /matches/:id/join → onSuccess
      → invalidateQueries(['matches', 'match', 'user/my-matches'])
      → useMatch(id) refetches → roster updated → isJoined = true

Wallet History:
  POST /wallet/history → { transactions: [...], total, hasMore }
    → hook unwraps: raw.transactions → adaptTransactionList() → Transaction[]
```
