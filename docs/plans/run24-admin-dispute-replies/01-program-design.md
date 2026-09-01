# Run #24 — Program Design (admin dispute replies, P2-2)

## Problem
Admin console dispute detail is read-only for conversation: `dispute_messages` renders but there is no way for an admin to reply. Players open a dispute (AppealSheet) and never hear back — a dead-end ops loop.

## User story
As an admin, when I open a dispute detail page, I can type a reply, send it, and see it appended to the conversation thread immediately — so the reporter/respondent get the outcome and guidance inside KoraLink.

## Scope
IN: `POST /admin/disputes/:id/messages` (auth'd admin, validation, populated return), reply composer UI (textarea + send + states), en/ar i18n, jest spec.
OUT: player-side dispute thread UI, push/WS notification on reply (follow-up), dispute email bridge.

## Architecture delta
One endpoint + one service method + one UI section. No schema change (table exists), no migration.

## API contract (Gate 3)
`POST /api/v1/admin/disputes/:id/messages`
- Auth: `AdminAuthGuard` (controller-level, same as siblings).
- Body: `{ "content": string }` — DTO `PostDisputeMessageDto`: `@IsString() @IsNotEmpty() @MaxLength(2000)` (trim in service; DTO rejects empty/oversize → 400).
- 404 when dispute id unknown (reuse `findOne`'s NotFoundException).
- **Returns the fully populated dispute**: `this.findOne(id)` AFTER the insert (contract §2; populated object incl. `messages[]`).

Exact success JSON: `{ id, type, status, decision, policy_ref, created_at, updated_at, reporter: {...}, respondent: {...}, match: {...}, messages: [ { id, content, created_at, author: { id, full_name, avatar_url } } ... ] }` (same shape as `GET /admin/disputes/:id`).

## Service method signature
```ts
async addMessage(id: string, content: string): Promise<ReturnType<AdminDisputesService['findOne']>>
```
Insert single row (`dispute_messages`: dispute_id, author_id=adminId, content=trimmed) → then `return this.findOne(id)` outside any tx.

## Frontend contract
- `apiFetch('/admin/disputes/${id}/messages', { method:'POST', body:{content} })` returns the populated dispute → `reload()` refetches via useLiveAdminData (socket-live list stays consistent).
- UI: composer under the messages thread (`aria-label` localized), disabled+`sending` while in flight, inline localized error on failure, success clears textarea; new message appears via reload.

## i18n keys (both files, 547-line catalogs)
`disputes.replyPlaceholder` · `disputes.replySend` · `disputes.replySending` · `disputes.replyFailed` — en + ar, parity-checked.

## Contract verification checklist (Gate 3)
- [x] Mutation returns populated object with relations — `findOne` after insert ✓
- [x] Frontend type accepts the exact JSON — reuse existing `DisputeDetail` type ✓
- [x] Adapter needed? none — admin consumes the API shape directly (house pattern) ✓
- [x] No silently-undefined fields — author columns mirror the read path ✓
- [x] i18n keys exist en+ar before build ✓

## Risks
- Oversight: resolve() audit-logs state changes; a reply is lower-stakes → audit-log ONLY content-free metadata (dispute id, admin, ip) to keep content out of the audit trail. Decision recorded.
- Race: two admins replying concurrently — independent inserts, no conflict possible; no idempotency key needed (non-money, non-retry-critical).
