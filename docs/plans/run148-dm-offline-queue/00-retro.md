# Run #148 — Gate 0 Retro: DM chat surface

**Scope audited:** `apps/player-pwa/src/hooks/useConversations.ts`, DM page
`src/app/[locale]/messages/[id]/page.tsx`, server `conversations.service.ts`
idempotency, and the proven P2-172 match-chat offline queue (`useMessages.ts`).

## Findings

1. **P2-224 (the build item): DM sends have no offline queue.**
   `useConversations.ts:379-389` — socket down → one-shot REST POST; fully
   offline the fetch rejects → bubble flips `failed`. Match chat queues,
   replays on reconnect, and backfills across sessions (`kl.offlineChatQueue.v1`).
   Same user, two different offline behaviors; DMs die silently. Server is
   ALREADY ready: `send-dm` accepts `clientMessageId`, pre-read idempotency
   (conversations.service.ts:285-292), unique index
   `personal_messages_client_msg_uidx` (schema.ts:865), and the REST
   `POST /conversations/:id/messages` carries the same idempotent contract.
2. Reviewer A run-#147 MINORs on the WS surface shipped as PR #152 follow-ups
   this run (reconcile-before-guard + pre-read before the rate limiter);
   remaining MINORs (useMessages terminal-error retirement, leave-conversation
   id-shape) → board rows, not drive-by fixes.
3. P1-52 escalated (prod Neon quota errors, 4 fresh events, 5h cadence) — owner.
4. Tech-debt scan: no `::uuid` casts, no `eq(col,null)`, no console.* in API
   prod paths (Reviewer A confirmed CLEAN on all standing bug classes).

## Decision

Build P2-224 as a PARALLEL DM queue module (`lib/offline-dm-queue.ts`) rather
than generalizing the match-chat module — zero risk to the proven P2-172 path,
same shape/hygiene (TTL 7d, cap 50, owner binding, orphan guard, ack-standdown,
backfill, listener fan-out). Reuses `messages.queuedOffline` i18n (EN+AR exist).

## DECISIONS.md check

No ledger row contradicts this work. The queued badge + toast mirror the
already-shipped, owner-accepted ChatSheet P2-172 UX (2026-10-04 ledger rules:
EN+AR parity — keys exist both locales; 5-UX-states — adds queued to the DM
surface's offline story).
