# Run #13 — Program Design (Gates 1-3 compact)

## Gate 1 — Problem & scope

**Problem:** the scheduler auto-cancels below-minimum matches within 60 min of kick-off
(`checkMinPlayers` Pass 2). Its refund path is NOT atomic: the guarded `Cancelled` UPDATE commits
first, then wallet credit + ledger insert + slot release run as separate statements inside a
try/catch that only logs. Any failure after the guard → cancelled match, booked slot, **host never
refunded, no retry** (status no longer Open/Full). Silent money loss in an automated path.

**Second defect (bundled):** clearing a no-show mark closes the auto-opened dispute with
`status IN ('opened','under_review')` → `rejected`, overwriting an admin's in-flight review.

**User stories:**
- As a host whose underfilled koralink match gets auto-cancelled, I am refunded exactly what I was
  debited, atomically with the cancellation.
- As an admin reviewing a no-show dispute, a host clearing the mark does not silently reject my
  open review.

**IN:** make Pass 2 atomic per-match via `db.transaction` (same semantics as manual `cancelMatch`);
narrow the clear-mark dispute closure to `status = 'opened'`. Jest specs for both.
**OUT:** idempotency redesign (key already correct), Pass 1 nudge copy localization (P2-8),
retry/DLQ infrastructure, manual cancelMatch changes, LIMIT/ORDER BY tuning.

**Success criteria:** Pass 2 performs status flip + credit + ledger + slot release in ONE
transaction; refund failure rolls back the cancellation; clear-mark leaves `under_review` rows
untouched; all gates green (turbo build 3/3, jest, vitest, tsc, PWA lint).

## Gate 2 — Architecture delta

- `MatchesService.checkMinPlayers()` Pass 2 loop body: replace guard-UPDATE-then-side-effects with
  `this.db.transaction(async (tx) => { guarded UPDATE via tx.execute; if rowCount 0 → skip;
  wallet credit via tx.update; ledger insert via tx.insert(onConflictDoNothing); slot release via
  tx.update })`. Post-tx notifications stay best-effort outside the tx (same as manual cancel).
- `markNoShow()` clear branch: `inArray(disputes.status, ['opened','under_review'])` →
  `eq(disputes.status, 'opened')`.
- New spec `matches.auto-cancel-atomicity.spec.ts` (tx mock); new cases in
  `matches.mark-noshow.spec.ts` (under_review preserved).
- No DB migration (no schema change). No new endpoints. Observability: keep Pino logger on the
  skip path (SchedulerError-classified log line).

**Files changed:** `apps/api/src/modules/matches/matches.service.ts` (only),
`apps/api/src/modules/matches/matches.auto-cancel-atomicity.spec.ts` (new),
`apps/api/src/modules/matches/matches.mark-noshow.spec.ts` (+2 cases).

## Gate 3 — Contracts

**Exact JSON shapes: unchanged** — `checkMinPlayers` is an internal scheduler job (returns void /
log lines); `markNoShow` still returns `this.findOne(matchId)` (populated MatchDetail, API §2).
No DTO/i18n/hook/adapter changes (API-internal integrity slice; PWA untouched).

**Contract verification checklist:**
- ✓ Every mutation returns populated object: markNoShow unchanged (`findOne` outside tx, :1786).
- ✓ Frontend types accept backend JSON: no shape change; PWA not touched.
- ✓ Adapters exist for consumed shapes: n/a (no new shapes).
- ✓ No silently-undefined fields: n/a (no response change).
- ✓ i18n keys for user-facing strings: no new user-facing strings (push copy untouched this slice).

**Mock contract for the spec:** `tx` chain — `tx.execute(sql)` → `{ rowCount }`;
`tx.update(table).set(v).where(...)` → thenable; `tx.insert(t).values(v)` →
`{ onConflictDoNothing: () => ({ thenable }) }`; wallet credit asserted via captured
`sql` fragments (wallet balance via `sql.raw`-style captured args, slot predicate via captured
`where` arg). Service constructor deps mocked as no-op objects (realtime/gateway/notifications/
activities/settings unused on the tx path).

**Verdict: Gate 3 → Gate 4 GO.**
