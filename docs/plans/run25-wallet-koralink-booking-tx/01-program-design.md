# Run #25 — Program Design: koralink-booking wallet TOCTOU + Sentry noise gate

## Problem
1. **Koralink booking wallet TOCTOU** — `apps/api/src/modules/matches/matches.service.ts:1249-1268` reads the host's `users.wallet_balance` with a plain SELECT, then runs an UPDATE without a `wallet_balance >= cost` guard. Two concurrent koralink match creations by the same host (two different slots, or any pair of slots in flight) can both pass the in-tx balance check, both deduct, and drive the balance negative. There is no row lock on the `users` row — only on the `pitch_slots` row.
2. **Sentry noise from per-subscription push failures** — `apps/api/src/modules/notifications/notifications.service.ts:234-238` captures every non-404/410 push error including 429/400 noise per-subscription. A bad subscription pattern could flood Sentry.

## User story
- AS a host creating a koralink match,
- WHEN I (or any other client) submit two concurrent creates against my limited wallet balance,
- THE FIRST 201 succeeds, THE SECOND 409 Conflict with the same message shape; my wallet is never negative.
- AS an operator watching Sentry,
- WHEN a push fan-out hits transient 429/400 noise,
- Sentry stays quiet; only real 5xx/timeout is captured.

## Scope
### IN
- `apps/api/src/modules/matches/matches.service.ts`: rewrite the wallet-deduct block (lines 1247-1280) so the UPDATE is conditional on `wallet_balance >= pitchCostSar` and zero-rows → `ConflictException` with the existing message shape; keep the `slot-booking-<slotId>` idempotency key; ledger insert is now only reached after a successful deduct.
- `apps/api/src/modules/matches/matches.koralink-wallet.spec.ts` (new): 3 specs — (1) insufficient balance: balance 50 SAR, cost 80 → 400 BadRequest with the existing message; (2) concurrent: simulated two-call race with balance 100 SAR and cost 80 each → first tx rowCount=1, second 0 (caller throws ConflictException); (3) self-mode unaffected: no deduct, no ledger.
- `apps/api/src/modules/notifications/notifications.service.ts:234-238`: gate Sentry on `statusCode >= 500` or `statusCode == undefined` (timeout); 4xx (429, 400, etc.) goes to debug log only.
- Pino log on the ConflictException path carries `matchId` (NULL at throw time — the match row was never created) + `hostId` + `pitchCostSar` + `walletBalance`.

### OUT
- CSP `script-src 'unsafe-inline' 'unsafe-eval'` migration (multi-run, standing).
- Per-category push preferences (schema + product decision).
- PDPL account-delete / data-export.
- All Reviewer-B P1 backlog items.

## Architecture delta
**matches.service.ts (one tx block, lines 1247-1280):**

BEFORE (lines 1247-1280):
```ts
if (pitchCostSar > 0) {
  // Check balance first
  const [user] = await tx
    .select({ wallet_balance: users.wallet_balance })
    .from(users)
    .where(eq(users.id, hostId))
    .limit(1);
  if (!user || parseFloat(user.wallet_balance) < pitchCostSar) {
    throw new BadRequestException(
      `Insufficient wallet balance. Required: SAR ${pitchCostSar.toFixed(2)}, Available: SAR ${parseFloat(user?.wallet_balance ?? '0').toFixed(2)}`,
    );
  }
  // Deduct from wallet atomically
  await tx.update(users)
    .set({ wallet_balance: sql`${users.wallet_balance} - ${pitchCostSar.toString()}`, updated_at: new Date() })
    .where(eq(users.id, hostId));
  await tx.insert(schema.transactions).values({ ... });
}
```

AFTER:
```ts
if (pitchCostSar > 0) {
  // Conditional deduct: row updates only if the balance covers the cost.
  // The numeric `>=` predicate is enforced INSIDE the row update, so a
  // concurrent second booking by the same host that ran its own SELECT
  // moments before will see the new (decremented) value and fail fast
  // (zero-rows -> ConflictException). This is the same class of fix as
  // P0-4 (run #13) and P2-39 (run #22): move the integrity guard inside
  // the row update so the database enforces it, not the read-then-write
  // application logic.
  const deduct = await tx.update(users)
    .set({ wallet_balance: sql`${users.wallet_balance} - ${pitchCostSar.toString()}`, updated_at: new Date() })
    .where(and(eq(users.id, hostId), sql`${users.wallet_balance} >= ${pitchCostSar.toString()}`))
    .returning({ wallet_balance: users.wallet_balance });

  if (deduct.length === 0) {
    // Either the user doesn't exist (rare) or the balance is insufficient.
    // Re-read for a meaningful error message.
    const [user] = await tx.select({ wallet_balance: users.wallet_balance })
      .from(users).where(eq(users.id, hostId)).limit(1);
    throw new BadRequestException(
      `Insufficient wallet balance. Required: SAR ${pitchCostSar.toFixed(2)}, Available: SAR ${parseFloat(user?.wallet_balance ?? '0').toFixed(2)}`,
    );
  }

  await tx.insert(schema.transactions).values({
    user_id: hostId,
    type: 'DEBIT',
    amount: pitchCostSar.toString(),
    reference_type: 'PITCH_BOOKING',
    reference_id: dto.booking_slot_id,
    idempotency_key: `slot-booking-${dto.booking_slot_id}`,
    status: 'Completed',
  });
}
```

**notifications.service.ts (line 234-238):**

BEFORE:
```ts
if (statusCode !== 404 && statusCode !== 410) {
  Sentry.captureException(err, {
    tags: { channel: 'web-push', endpoint_prefix: sub.endpoint.slice(0, 24) },
  });
}
```

AFTER:
```ts
// Only capture TRANSPORT-level failures (5xx, timeouts) — 4xx per-subscription
// noise (429 rate limits, 400 invalid payloads) is expected and floods Sentry.
if (statusCode === undefined || statusCode >= 500) {
  Sentry.captureException(err, {
    tags: {
      channel: 'web-push',
      endpoint_prefix: sub.endpoint.slice(0, 24),
      status_code: String(statusCode ?? 'timeout'),
    },
  });
}
```

## API JSON shapes (UNCHANGED — both bugs are internal)

- `POST /matches` (koralink mode, validations, success) — unchanged
- `POST /matches` (koralink mode, insufficient balance) — `{ statusCode: 400, message: "Insufficient wallet balance. Required: SAR 80.00, Available: SAR 50.00", error: "Bad Request" }` — same shape as before (no contract change)

## Frontend hook signatures (UNCHANGED)
- `useCreateMatch().mutate({...})` — unchanged
- `useCreateMatch().error.message` — same string; no i18n key change

## Adapter function contracts (UNCHANGED)
- No frontend adapter changes

## i18n keys (UNCHANGED)
- No new strings

## Contract verification checklist (Gate 3)
- [x] Mutation endpoint returns populated `findOne(created.id)` outside tx — already true (:1295), unchanged
- [x] Frontend types accept the exact JSON the backend produces — unchanged
- [x] Adapter functions exist for every API shape — unchanged
- [x] No field silently undefined — unchanged
- [x] i18n keys for every user-facing string — unchanged (no new strings)
- [x] **NEW**: deduct is conditional on `wallet_balance >= cost` enforced INSIDE the row update (DB-enforced, not app-enforced)
- [x] **NEW**: zero-rows on deduct → `BadRequestException` with the SAME message shape (no frontend contract break)
- [x] **NEW**: ledger insert is INSIDE the tx (already), reached only on successful deduct
- [x] **NEW**: Sentry captures only 5xx/timeout (no new i18n key, no new endpoint)

## Files changed
- `apps/api/src/modules/matches/matches.service.ts` (1 block, lines 1247-1280)
- `apps/api/src/modules/matches/matches.koralink-wallet.spec.ts` (NEW, ~140 lines, mirrors matches.auto-cancel-atomicity.spec.ts pattern)
- `apps/api/src/modules/notifications/notifications.service.ts` (1 block, lines 234-238)

## Risks & mitigations
- **Risk**: changing the deduct code path might miss a call site. Mitigated by reading every `wallet_balance` reference in `apps/api/src` and the new jest spec covering the success + insufficient + self-mode branches.
- **Risk**: the `numeric(>=)` predicate may behave differently from `parseFloat(balance)`. Mitigated by using the same `pitchCostSar.toString()` shape already used in the line `wallet_balance: sql\`${users.wallet_balance} - ${pitchCostSar.toString()}\`` — symmetric.
- **Risk**: Sentry 4xx-noise might hide a real per-subscription outage. Mitigated by adding the `status_code` tag so a single 400 spike is filterable, and Pino debug logs are unchanged.

## Observability
- Pino log line on `ConflictException`: `this.logger.warn(\`koralink_wallet_insufficient hostId=${hostId} required=${pitchCostSar} slotId=${dto.booking_slot_id}\`, MatchesService.name);`
- Existing match_created log line unchanged.

## What is descoped
- CSP nonce migration (multi-run effort)
- Per-category push preferences (schema + product decision)
- PDPL account-delete / data-export (legal surface)
- P1 backlog (padel, skill-level, waitlist, presence, profanity, broadcast, withdrawal, WS reconnect UX)
