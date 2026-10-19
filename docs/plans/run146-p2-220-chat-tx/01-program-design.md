# Run #146 — Gates 1-3 Compact (P2-220)

## Gate 1 — Product spec (compact)
- Problem: a lobby message can be persisted AFTER the match ended (terminal flip between
  the chat-closed check and the INSERT). Cosmetic-impact race, but it is a write-path
  correctness hole on a user surface.
- User story: as a player, once my match has ended I never see new messages arrive in a
  dead lobby; as a host cancelling/completing a match, no message sneaks in under me.
- Success criteria: (1) the INSERT only executes when the row it read is still the live
  state (serialized against status transitions); (2) terminal-race → machine-code 403
  `MATCH_CHAT_CLOSED`; (3) idempotent retries keep returning the original row; (4) unknown
  match → 404, not a 500.
- OUT of scope: WS gateway path (same gap, separate touch — stays on P2-220's row as a
  follow-up note), message pagination, offline queue.

## Gate 2 — Architecture (compact)
- Files changed: `apps/api/src/modules/matches/matches.service.ts` (one method) +
  new spec `matches.chat-send-tx.spec.ts`. No controller/DTO/i18n/schema changes.
- Data flow: validate content → idempotency PRE-check (unchanged semantics) →
  `db.transaction`: SELECT match row FOR UPDATE (serializes vs completeMatch/cancelMatch
  and concurrent sends) → 404 if missing → membership inside tx → `isChatClosed(locked)`
  → 403 `MATCH_CHAT_CLOSED` if closed → INSERT + returning. Post-tx: re-read conflict
  winner, fetch author, return `{...inserted, user}` (unchanged contract).
- Risks: unit-spec stubs shape-changing (mitigated: only matches.chat-closed.spec.ts stubs
  it — rewritten as a tx-aware stub); lock contention on the match row during bursts
  (accepted: sub-ms critical section, matches join-payment precedent).

## Gate 3 — Program design (contracts)

### Method signature (unchanged)
```ts
async sendMessage(userId: string, matchId: string, content: string, clientMessageId?: string):
  Promise<typeof match_messages.$inferSelect & { user: {...} }>
```

### Exact behavior contract
| Input state | Before | After |
|---|---|---|
| Empty content | 400 | 400 (unchanged) |
| Unknown match | FK 500 (latent bug) | 404 `Match not found.` |
| Non-member | 403 | 403 (unchanged, now inside tx) |
| Chat closed (terminal/expired) | 403 + `code: MATCH_CHAT_CLOSED` | same, but read from LOCKED row |
| Race: terminal flip mid-send | message LANDS (bug) | 403 `MATCH_CHAT_CLOSED` (locked row seen closed) |
| Retry with same clientMessageId | existing row | existing row (pre-tx fast path unchanged) |
| Retry AFTER terminal flip | 403 | **existing row** (idempotency first — P2-172 reconcile contract) |
| Concurrent duplicate send | 409 / winner row | unchanged (post-tx conflict read) |

### Response shape (unchanged)
`{ id, match_id, user_id, content, client_message_id, created_at, user: { id, full_name, handle, avatar_url } }`

### i18n keys
None added/removed — error stays a machine code the PWA localizes.

## Gate 3 contract verification checklist
- [x] Not a mutation-return change — return contract byte-identical (findOne-style rule N/A;
      message rows intentionally return the row + author, same as before).
- [x] Frontend `ChatMessageApi` accepts the exact JSON (no field added/removed).
- [x] Adapter functions untouched — zero frontend drift.
- [x] No field silently undefined (user join preserved on both insert and conflict paths).
- [x] i18n: no new user-facing strings (machine code unchanged, PWA copy already localized).

## Gate 4 slices
1. Tracer: tx rewrite of sendMessage (404 + locked predicate + guarded insert) + rewritten
   chat-closed spec + new tx spec → build + full jest green → lane commit.
2. PR → bot checks → triage PR-Agent → squash-merge when green (P2-208 pending queue may
   hold the merge; that is expected and recorded).
