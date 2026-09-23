# Run #66 — Program Design (Gates 1–3 compact)

Problem: run #65 shipped three contract gaps (https not enforced on UnsubscribeDto;
nondeterministic keyset tie order; hasMore never clears on history end).

User story: as a player, tapping "Load earlier messages" eventually hides the button
when history ends; paging never skips/duplicates a message that shares a timestamp;
a mistyped http:// push endpoint is rejected at the API boundary, not just at send.

## Exact contracts (Gate 3)

### 1. UnsubscribeDto (api)
```ts
@IsUrl({ protocols: ['https'], require_tld: true })
@IsNotEmpty()
endpoint!: string;
```
- Accept: `https://fcm.googleapis.com/fcm/send/abc` (unchanged)
- Reject (new): `http://fcm.googleapis.com/...` (validator IsUrlOption `protocols`)
- Reject (unchanged): non-URL, empty, TLD-less, unknown extra fields
- IP-literal note (run #65 spec comment) stays: DTO cannot reject IP hosts; SSRF
  defense remains the service allowlist on the send path.

### 2. getMessages deterministic ordering (api)
- before-cursor window: `orderBy: (m, { asc }) => [asc(m.created_at), asc(m.id)]`
- latest-window probe: `orderBy: (m, { desc }) => [desc(m.created_at), desc(m.id)]`
- Response shape unchanged: chronological bare array; `reverse()` after DESC probe.
- Tie order now matches the composite predicate `(created_at, id) <` exactly.
- Index `match_messages_match_created_idx` (migration 0014) already covers both.

### 3. hasMore exhaustion (pwa, useMessages.ts)
State machine: `hasMore = !olderExhausted && probe.length > CHAT_PAGE_SIZE`
- `olderExhausted` set true when a loadOlder response `length < CHAT_PAGE_SIZE`
- reset to false when matchId changes (alongside the olderMessages reset)
- full 50-message older page → hasMore stays true (existing behavior pinned by test)

## Files changed
| File | Change |
|---|---|
| apps/api/src/modules/notifications/dto/notifications.dto.ts | protocols: ['https'] + comment |
| apps/api/src/modules/notifications/notifications.controller.spec.ts | +1 test (http rejected) |
| apps/api/src/modules/matches/matches.service.ts | 2 orderBy tuples |
| apps/api/src/modules/matches/matches.chat-pagination.spec.ts | +1 test (tie-break pinned both windows) |
| apps/player-pwa/src/hooks/useMessages.ts | olderExhausted state + doc comment |
| apps/player-pwa/test/hooks/useMatchChatPagination.test.tsx | +1 test (short page ⇒ hasMore=false) |

## Slice plan (Gate 4)
S1: api DTO fix + spec → jest notifications green → commit
S2: api keyset ordering + spec → jest matches green → commit
S3: pwa hasMore + test → targeted vitest + type-check → commit
Final: full `turbo run build` 3/3 exit 0 → board/state/report → push.
