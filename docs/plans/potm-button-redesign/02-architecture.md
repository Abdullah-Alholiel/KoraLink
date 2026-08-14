# Gate 2: Architecture Spec — POTM Card Button Redesign & Voted State

> Architecture and schema additions for POTM voting state.

---

## 1. NestJS `findNearby` SQL Update

```sql
SELECT
  ...
  EXISTS(SELECT 1 FROM match_votes mv WHERE mv.match_id = m.id AND mv.voter_id = ${currentUserId}::text) AS has_voted
FROM matches m
...
```

---

## 2. API Adapter & Frontend Types

```typescript
// types/index.ts
export interface Match {
  ...
  hasVoted?: boolean;
}

// api-adapter.ts
export interface NearbyMatchApi {
  ...
  has_voted?: boolean;
}

export function adaptNearbyMatch(row: NearbyMatchApi): Match {
  return {
    ...
    hasVoted: Boolean(row.has_voted),
  };
}
```

---

## 3. `MatchCard.tsx` Styling Logic

```tsx
if (isCompletedToday) {
  if (match.hasVoted) {
    buttonLabel = `✓ ${t('pom.votedShort') || 'Voted'}`;
    buttonStyle = 'bg-amber-50 text-amber-800 border border-amber-200/80 text-xs font-semibold px-4 py-2 rounded-full';
    badge = (
      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
        ✓ {t('pom.votedShort') || 'Voted POTM'}
      </span>
    );
  } else {
    buttonLabel = `🏆 ${t('pom.vote') || 'Vote'}`;
    buttonStyle = 'bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-sm hover:bg-amber-600 transition-colors';
    badge = (
      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
        🏆 {t('pom.title') || 'POTM'}
      </span>
    );
  }
}
```
