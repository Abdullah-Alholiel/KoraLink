# Run #127 — DB & Infra cycle (P2-179 + P2-184)

## Gate 0 — Retro (compact)

- Baseline: run #126 (PRs #119 `f278415` predicates, #120 `e2e0a74` toasts). Both verified
  TRUE this run (i18n keys + chunk grep; :2901/:2981/:3114 predicates + returning guards;
  lock spec 14/14). Fix:feat ratio healthy — 2 shipped fixes were board-planned items, no
  regressions.
- Reviewer-B CRITICALs both REFUTED by parent code read (claims ≠ facts applies to reviewers):
  - "Reports unresolvable" — admin `reports.controller.ts:35` `@Post(':id/resolve')` +
    `:45` reopen + `:51` PATCH exist (B grepped the player-facing controller only).
  - "No WS emit on transitions" — `broadcastStatusUpdate` fires at start :2915, complete
    :3049, cancel :3241 (+join/leave/reschedule/POM). B misread catch-block error logs.
- New accepted findings: WS handshake CORS `callback(null,true)` (app.gateway.ts:68-74) →
  **P2-185** hardening backlog; web-push-only iOS reachability → **P2-186** owner-verification.
- Hex lane: `api_exc_total` 266→269 = exactly 3 new `ConflictException` guards from f278415
  (allowed service-layer pattern) → baseline updated in hex-audit.mjs, P2-183 row noted.
- DECISIONS.md consulted: no design/UX change this cycle touches ledger entries. P0-2
  payment finding folds into the existing owner-gated row.

## Gates 1-3 — Program design (compact, both items)

### Item 1 — P2-179: disputes SLA queue index + lock-order convention (DB & Infra lane)

**Problem:** disputes SLA sweep + admin list both filter
`(status IN ('opened','under_review'), updated_at overdue, NOT sla_escalated)` but only
`disputes_status_idx` (single-column status) exists → seq scan + filter, and the sweep's
window grows linearly with dispute history. Also: zero documented tx-isolation/lock-order
convention for money paths.

**Scope:** (a) ONE partial composite index via journaled migration 0050 (raw-SQL-only,
0047/0049 convention); (b) `docs/db-conventions/lock-order-and-isolation.md` + checklist
line in the koralink-api-standards skill.

**Exact contract:**
- Migration SQL: `CREATE INDEX IF NOT EXISTS disputes_sla_queue_idx ON disputes (updated_at)
  WHERE status IN ('opened','under_review') AND sla_escalated = false;`
  — predicate implies the sweep WHERE, so PG uses it for sweep AND admin open-queue list.
- Journal entry: `idx: 51, when: 1791598051701 (> live newest 1791598051700), version: "7",
  breakpoints: true, tag: 0050_disputes_sla_queue_idx`.
- Snapshot: copy `0049_dispute_sla_snapshot.json`, fresh uuid4 `id`,
  `prevId: 26c027bf-3264-44bc-afd4-d668f74a1e11` (0049's id).
- Apply: `node scripts/migrate-vps.mjs` (VPS path; drizzle-kit migrate errors there).
- Verify: index in `pg_indexes`; `EXPLAIN` of a sweep-shaped query flips Seq Scan → Index
  Scan; `npx jest src/database/drizzle-migration-journal.spec.ts
  src/database/drizzle-snapshot-chain.spec.ts` = 8 PASS before push.

### Item 2 — P2-184: CORS http-funnel-origin allowlist

- `apps/api/.env` (gitignored, VPS-local): append
  `http://aa.tail2948f9.ts.net:10000` to PLAYER_URL (exact Sentry KORALINK-API-B signature).
- `.env.example` gets a documented comment line for the http funnel variant.
- Restart `koralink-api.service` AFTER (no dist change, but env is read at boot).
- Live verify: OPTIONS/GET with the http origin returns ACAO header; bogus origin still
  rejected; https funnel unaffected.

## Gate 3 contract checklist
- [x] Index-only migration: no schema.ts change needed (partial index is not a Drizzle
      table declaration on this codebase's 0047-precedent convention) — verified: schema.ts
      has no `using`/gist declarations for 0047 either.
- [x] Journal/snapshot chain rules from run #39/#103 applied (above).
- [x] Live-DB apply happens ONLY after code+meta committed (Phase 4.5 rule 1).
- [x] Convention doc covers creditWalletTx caller contract + review checklist line.
- [x] CORS change is env-only on the VPS funnel host; no code path change; no security
      widening beyond the evidence-cited origin.
