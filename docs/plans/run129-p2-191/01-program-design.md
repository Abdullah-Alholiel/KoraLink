# Run #129 — Program Design (P2-191 + audit throttle fix)

Gates 1-2 compacted (autonomous mode): problem = blind RMW on two admin edit
endpoints; user story = "an admin editing a dispute note never silently clobbers a
decision another admin just made"; scope = 2 service methods + 1 throttle decorator
+ regression tests. No schema/i18n/API-shape changes. Architecture delta: none
(follows the file's own established conventions).

## Contract (Gate 3)

### disputes.update() — after
```
async update(id, dto, adminId, ip?) {
  const before = await this.findOne(id);           // unchanged (404, validation)
  ...validation unchanged...
  const updated = await this.db
    .update(disputes)
    .set(withTimestamp(updates) as never)
    .where(and(eq(disputes.id, id), eq(disputes.status, before.status)))
    .returning({ id: disputes.id });
  if (updated.length === 0) {
    throw new ConflictException('Dispute was concurrently updated — re-check its status.');
  }
  const after = await this.findOne(id);
  await this.auditSafe(adminId, 'dispute.update', id, before, after, ip);
  this.realtime.broadcastOps('disputes');
  return after;
}
```
Rationale: single-statement guarded UPDATE is atomic under READ COMMITTED (lock-order
doc Rule 1) — the row cannot change status between the predicate check and the write.
ANY-status editing stays allowed (owner's post-closure-corrections rule); the guard is
on *concurrency*, not on which statuses may be edited. Same response shape ({...dispute,
messages}) — zero client contract change.

### reports.update() — after
Identical shape: `.where(and(eq(reports.id, id), eq(reports.status, before.status)))`,
`.returning({ id: reports.id })`, zero rows → `ConflictException('Report was
concurrently updated — re-check its status.')`. Same response shape.

### auth dev-login throttle
`@Throttle({ default: { ttl: 60_000, limit: 3 } })` on POST /auth/dev-login — mirrors
the send-otp route cap (:53). Dev-only route (DEV_LOGIN_ENABLED gate) so blast radius
is dev environments; behavior change = scripted logins beyond 3/min get 429.

## Gate 3 verification checklist
- [x] No mutation response-shape change (both still return findOne(id) full object)
- [x] No new i18n keys (admin console copy unchanged)
- [x] No DB migration (predicates only)
- [x] Error contract: new 409 path documented in service JSDoc
- [x] Tests: extend write-concurrency.spec.ts (2 new its) + tsc/jest gates

## Observability
No new error path needs instrumentation: ConflictException → Nest's standard 409;
Pino logs it via the existing exception filter; Sentry captures 5xx only (409 is a
client race, correctly not an error event).
