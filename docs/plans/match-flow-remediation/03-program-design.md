# Gate 3 — Program Design: Match Flow & State Remediation

## C-3: Fix wallet history shape mismatch

```typescript
// useWallet.ts — useWalletHistory BEFORE (broken):
const raw = await fetcher<TransactionApi[]>('/wallet/history');
return { transactions: adaptTransactionList(raw) };

// AFTER (fixed):
const raw = await fetcher<{ transactions: TransactionApi[]; total: number; hasMore: boolean }>('/wallet/history');
return { transactions: adaptTransactionList(raw.transactions) };
```

## C-4: Make MatchCard entirely clickable

```tsx
// MatchCard.tsx — wrap everything in Link
<Link href={`/${locale}/match/${match.id}`} className="block">
  <div className="bg-white rounded-2xl ...">
    {/* header, location, spots */}
    <span className="bg-brand-green ...">{t('matchDetail.joinMatch')}</span>
  </div>
</Link>
```

## I-2: Fix My Games cache invalidation

```typescript
// useMatchActions.ts — add my-matches invalidation
onSuccess: (_, matchId) => {
  queryClient.invalidateQueries({ queryKey: ['matches'] });
  queryClient.invalidateQueries({ queryKey: ['match', matchId] });
  queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] }); // ← NEW
},
```

## US-5: Match Rules bottom sheet

```typescript
// MatchRulesSheet.tsx
interface MatchRulesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  rules?: string[];
}
// Opens from match detail "View Match Rules" button
```

## I-1: Join loading state

```typescript
// match/[id]/page.tsx — show pending state
const handlePaySuccess = () => {
  setShowPayment(false);
  joinMatch.mutate(id);
};
// In JSX: joinMatch.isPending && <Loader2 spinner />
```
