# Gate 2-3 — Architecture + Program Design: Interactive Completeness

## Files Changed

| File | Change |
|------|--------|
| `DevLoginBar.tsx` | Fetch `/users/me` after login, call `useAppStore.getState().login()`, use `router.push()` |
| `messages/page.tsx` | Import `useMyMatches` from `@/hooks/useUser`, use `adaptMatchList()` |
| `BottomNav.tsx` | Treat `/my-games` + `/personal-info` as Profile sub-pages |
| `play/page.tsx` | Replace `<span>` with `<input>`, add filter state |
| `clubs/page.tsx` | Wire map button or remove, rename "Book" → "View" |
| `wallet/page.tsx` | Add `balanceLoading` check → show skeleton |
| `complete-profile/page.tsx` | Wire camera button onClick |
| `DevLoginBar.tsx` | Fix phone numbers: `+966500000001` |

## Key Signatures

### C-1: DevLoginBar
```typescript
const devLogin = async (phone: string) => {
    const res = await fetcher<{message:string; token?:string}>('/auth/dev-login', {method:'POST', body:JSON.stringify({phone})});
    if (res.token) setAuthToken(res.token);
    const profile = await fetcher<UserProfileApi>('/users/me');
    useAppStore.getState().login({...}, res.token ?? '');
    router.push(`/${locale}`);
};
```

### C-2: Messages page
```typescript
// Change import:
import { useMyMatches } from '@/hooks/useUser';
import { adaptMatchList } from '@/lib/api-adapter';
// Usage:
const { data: matchesApi, isLoading, error, refetch } = useMyMatches();
const matches = matchesApi ? adaptMatchList(matchesApi) : [];
// Now has: match.title, match.organizer.name, match.format, etc.
```

### I-1: BottomNav
```typescript
const isActive = (href: string) => {
    const fullPath = `/${locale}${href}`;
    if (href === '') return pathname === `/${locale}`;
    if (href === '/profile') {
        // Also highlight for sub-pages
        return pathname.startsWith(fullPath) ||
            pathname.startsWith(`/${locale}/my-games`) ||
            pathname.startsWith(`/${locale}/personal-info`);
    }
    return pathname.startsWith(fullPath);
};
```
