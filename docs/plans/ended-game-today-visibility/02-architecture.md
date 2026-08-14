# Gate 2: Architecture Spec — Ended Game Today Visibility & POTM Access

> Technical design and SQL query updates for NestJS API and Next.js PWA.

---

## 1. NestJS SQL Feed Query (`findNearby`)

```sql
WHERE (
  ${
    venue_id
      ? sql`TRUE`
      : currentUserId
      ? sql`
          (
            m.status IN ('Open', 'Full', 'InProgress')
            AND (m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) >= NOW()
          )
          OR (
            m.scheduled_at >= CURRENT_DATE
            AND (mp.user_id = ${currentUserId}::text OR m.host_id = ${currentUserId}::text)
          )
        `
      : sql`
          m.status IN ('Open', 'Full', 'InProgress')
          AND (m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) >= NOW()
        `
  }
)
```

---

## 2. PWA Component Architecture

1. **`MatchCard.tsx`**:
   Check if `match.status === 'completed'` and match date is today and `(isJoined || isHost)`:
   - Render `🏆 POTM` badge.
   - Render `Vote POTM` button with amber accent styling.
2. **`my-games/page.tsx`**:
   Filter active games to include `status === 'completed'` for matches scheduled today.
