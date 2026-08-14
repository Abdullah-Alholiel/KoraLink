# Gate 3: Program Design — Ended Game Today Visibility & POTM Access

> Signature and contract specifications.

---

## 1. Backend Service (`matches.service.ts`)

```typescript
findNearby(dto: GetMatchesDto, currentUserId?: string)
// Includes completed matches from CURRENT_DATE for currentUserId
```

---

## 2. Frontend Components (`MatchCard.tsx` & `my-games/page.tsx`)

```typescript
// MatchCard.tsx
const isCompletedToday = match.status === 'completed' && match.date === new Date().toISOString().split('T')[0];
if (isCompletedToday && (isJoined || isHost)) {
    buttonLabel = t('pom.votePrompt');
    buttonStyle = 'bg-amber-500 text-white font-bold shadow-[0_2px_10px_rgba(245,158,11,0.4)]';
    badge = (
        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            🏆 {t('pom.title')}
        </span>
    );
}
```

---

## 3. Verification Criteria
1. `npx vitest run` passes 91/91 unit tests.
2. `npm run build` passes with 0 errors.
