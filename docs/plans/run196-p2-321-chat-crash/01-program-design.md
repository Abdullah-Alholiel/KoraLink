# Run #196 — Gates 1–3 Compact: P2-321 chat page (crash fix + error state)

## Problem (user story)

As a player, when I tap "expand thread" on a match chat, the full-page thread
(`/[locale]/match/[id]/chat`) **crashes the app** — white/crashed screen on client
navigation, 500-shell on SSR — because the page passes a plain object where React 19
requires a thenable. Additionally, if the match fetch fails (offline/5xx), the header
would show "Loading…" forever instead of an error state with retry.

## Scope

IN: fix the `use()` params misuse (Promise prop pattern); page-level match-fetch error →
shared ErrorState + retry; regression suite.
OUT: MatchChat internals (own specs), i18n changes (zero new keys needed), any API change.

## Architecture delta

One file changes its params contract:

```
Before: export default function MatchChatPage() { const params = useParams(); use(params as Promise) }
After:  export default function MatchChatPage({ params }: { params: Promise<{ id, locale }> }) { const { id } = use(params) }
```

Matches the two working siblings verbatim (`match/[id]/page.tsx:74-78`,
`messages/[id]/page.tsx`). No store/hook/adapter changes.

## Gate 3 contract checklist

- [x] No API endpoints touched → no JSON shapes to pin.
- [x] Hook contract: `useMatch(id)` already returns `{ data, error, refetch }` (React
  Query useQuery) — consumed fields all exist; no silently-undefined fields.
- [x] Adapter: none new; `errorKey(classifyError(matchError))` maps FetchError → existing
  `errors.*` keys (verified present in en.json + ar.json: `server`, `network`, …).
- [x] i18n: ZERO new keys — `common.retry`, `common.loading`, `errors.*` exist in both
  locales (parity re-verified by Reviewer A: 1188=1188).
- [x] Early return placed AFTER all hooks (`use`, `useRouter`, `useTranslations`,
  `useMatch`) — hook order stable across renders (no conditional-hook violation).
- [x] Test contract: `useParams` deliberately absent from the next/navigation mock → a
  revert to the broken pattern fails the suite loudly.

## Test plan

1. Renders through a REAL params Promise with a cached title (root-cause pin).
2. Header shows `common.loading` while the match query warms (legit loading).
3. Failed fetch (status 500) → classified `errors.server` ErrorState, `role=status`
   live region, retry calls `refetch`, thread never rendered.
   - jsdom prime-render quirk (React 19 first-render never resumes from `use()`
     suspension) documented + absorbed by a `beforeAll` throwaway render.
