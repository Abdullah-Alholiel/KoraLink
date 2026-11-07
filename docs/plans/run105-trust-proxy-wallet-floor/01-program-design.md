# Run #105 — API lane + security lens (trust-proxy + reschedule wallet floor)

Cycle: run #105 (2026-10-05T15:15Z fire). Rotation 105 % 4 = 1 → **API lane**, security-lens
emphasis. DECISIONS.md consulted at Gate 0 — no design decision in this cycle touches any
owner-standard surface (auth/infra hardening only; nothing visual, nothing money-policy).

## Gate 0 — Retrospective (compact)

- **Baseline**: run #104 (two PWA items, PRs #83/#84). Reviewer B independently verified the
  deeper claims 4/4 PASS (deep-links `settings/page.tsx:76/:98/:105/:147`, RealtimeBanner
  socket lifecycle `RealtimeBanner.tsx:32-48`, 5 behavior specs, links-not-duplicates rule).
- **fix:feat ratio** (last 12 commits on staging): 4 fix / 4 feat / 4 docs — healthy.
- **Service health**: api/pwa/admin active, /health 200, 0 journal errors 5h.
- **Sentry**: no new issues since 10-04 (newest API 10-03, web frozen 09-14). Triage: all
  pre-existing MINOR noise; nothing boarded (per run #103/#104 precedent).
- **Audit lane (FIX-before-HUNT)**: run-1 `needs_validation` finding
  `api-auth:per-ip-cap-proxy-trust` is the ONLY un-fixed confirmed/needs_validation record —
  Swagger finding already fixed (243f6d1, prod-404 verified); ban-before-transition closed
  (run #88). The trust-proxy defect is REAL in staging topology: no `app.set('trust proxy')`
  anywhere (grep), API fronted by Traefik on 443 → all users share ONE proxy IP for
  `req.ip` → (a) per-IP OTP caps (50/day + 3/min route throttle) collapse into one global
  bucket (DoS: 50 OTPs/day platform-wide), (b) admin audit logs record the proxy IP as the
  actor IP. **This run FIXES the audit finding.**
- **Reviewer A (security lens)**: confirmed the trust-proxy IMPORTANT (I1) and found a second
  same-class money-path defect: **rescheduleMatch wallet floor is an unlocked check-then-act**
  (`matches.service.ts:3102-3122` — plain users-row SELECT + unconditional increment; a
  concurrent debit on the same host can pass the floor read and drive balance negative).
  Standing bug classes all clean; DTO drift minor (UpdateMatchScheduleDto @Length(36,36) vs
  UUID_SHAPE — folded as a rider).
- **Reviewer B**: 4/4 run-#104 claims verified; product gaps scanned; nothing new P0/P1
  (offline mutation queue already parked P2-7/P2-46; locale negotiation noted).

## Gate 1 — Product spec (compact)

- **Problem**: two defects in the auth/money hardening surface, both invisible when green:
  1. Rate limits and audit IPs are wrong behind the ingress proxy (operational defect:
     platform-wide OTP outage after ~50 sends/day; audit trail records proxy IP).
  2. Concurrent reschedules/debits on one host can drive `wallet_balance` negative
     (P2-41's exact race, reintroduced on a path the P2-41 fix didn't cover).
- **User stories**: as a player, my OTP login must never be blocked by other users' traffic.
  As the owner, the audit log must record the real client IP. As the owner, no sequence of
  legal host actions may drive a wallet negative.
- **Success criteria**: trust proxy is opt-in env config (default OFF = current behavior);
  with it ON, req.ip = real client IP from the proxy chain; with it OFF, unchanged. Reschedule
  wallet floor enforced atomically in SQL (zero-race). Full gates green; both fixes live on
  staging API.

## Gate 2 — Architecture (compact)

- **Slice 1 — trust proxy**: new `apps/api/src/common/security/trust-proxy.ts` exporting
  `resolveTrustProxyConfig(raw: string | undefined): false | number | string` (pure, unit-test
  'no' + full E2E probes in the RUNS report. No schema/migration/i18n — infra slice. Tests:
  helper spec (valid/invalid/env-optional), controller wiring tripwire (spec-pinned via the
  caller side: `expect(...).toHaveBeenCalledWith(1)` on the mock).\\n
- **Slice 2 — reschedule wallet floor**: `matches.service.ts` reschedule tx — replace the
  plain users SELECT with `.for('update')` (locks the row, serializes concurrent debits on
  the same host; consistent with join/leave/remove lock discipline and dead-lock-safe: reschedule
  already holds match+slots locks before touching users, cancelMatch touches users after
  acquiring the same match lock in the same order). Keep the JS floor throw for a
  human-readable message; then move the guard INSIDE the UPDATE (P2-41 pattern, `sql` predicate
  `wallet_balance >= delta` when delta > 0) + zero-rows → re-read + Pino warn + BadRequest —
  so the DB enforces the floor even if the JS guard is ever refactored away. Rider: `UpdateMatchScheduleDto.booking_slot_id` → shared
  `UUID_SHAPE` convention (run-#94 id-shape.ts), matching the run-#139 rider precedent.
- **Files changed**: trust-proxy.ts (new) + trust-proxy.spec.ts (new) + main.ts (3 lines) +
  matches.service.ts (floor block) + update-match-schedule.dto.ts (rider) + specs.

## Gate 3 — Program design (contract, exact)

- **No API contract change.** No endpoint shape, DTO wire shape, or status code changes.
- Slice 1 config contract: `TRUST_PROXY` env → Express trust-proxy setting, resolved by
  `resolveTrustProxyConfig(raw: string | undefined): false | number | string`:
  - `undefined` / `''` → `false` (byte-compatible current behavior — req.ip = socket address)
  - positive integer N (`1`, `2`, `4`) → trust N proxy hops (Render edge = 1; Traefik-fronted
    VPS = 1)
  - `true` (case-insensitive) → trust the full X-Forwarded-For chain (fronted by a trusted
    ingress that OVERWRITES XFF — both our ingress points qualify; direct-to-port XFF spoofing
    is out of threat model because the API binds localhost:3001 on the VPS and Render's edge
    owns the port in prod)
  - `loopback` / `unip` / `bin` / `false` / garbage → **boot-fail** (P0-3 refuse-to-boot
    doctrine) with the exact live env value named in the error
- Slice 2 (matches.service.ts reschedule tx, step-3 wallet block): the users SELECT gains
  `.for('update')`; the guard moves INSIDE the UPDATE —
  `and(eq(users.id, userId), sql`${users.wallet_balance} >= ${walletDeltaSar.toString()}`)`
  when delta > 0; zero-rows → best-effort re-read + Pino warn
  `reschedule_wallet_insufficient hostId=… required=… matchId=…` + BadRequest (same message
  shape as the createMatch P2-41 block). delta < 0 (refund-heavy) keeps the plain update (a
  credit needs no floor). Rider: `UpdateMatchScheduleDto.booking_slot_id` bare
  `@Length(36,36)` → shared `UUID_SHAPE` @Matches + @MaxLength(36) (run-#94 id-shape.ts
  convention, run-#139 rider precedent).
- **Tests**: (1) `trust-proxy.spec.ts` — table-driven: each accepted form returns the exact
  Express value, each rejected form throws naming the value, undefined → false.
  (2) `matches.reschedule-wallet-floor.spec.ts` — (a) sufficient balance → net delta applied
  exactly once; (b) PgDialect.sqlToQuery tripwire: the UPDATE carries the `>=` wallet_balance
  predicate when delta > 0; (c) zero-rows → BadRequest + Pino warn; (d) delta < 0 → no floor
  predicate; (e) source tripwire pins `.for('update')` on the users read in the reschedule tx.
- **i18n**: none (no user-facing copy; reschedule insufficient-balance message stays the
  English API error, consistent with the existing createMatch error).

## Gate 4 — Slice plan

1. Slice 1: helper + spec (TDD: spec first, watch fail, implement, pass), main.ts wiring,
   api tsc + jest trust-proxy + turbo build + restart + live probe.
2. Slice 2: reschedule floor fix + new spec file, api tsc + targeted jest, turbo build,
   restart.
3. Docs/kanban commit (direct) at Phase 5.

## Defaults + veto status

- P2-147 (full-set-with-cap): clock elapses 2026-10-06T10:16Z — **this run fires 19h56m
  before elapse → HOLD** (not built). Run #108 (Oct 6 15:15Z) builds it if no veto.
- P2-151 (playwright gate): elapses 2026-10-06T02:16Z — **HOLD this run**; run #106
  (Oct 6 01:15Z) fires 1h BEFORE elapse → also HOLD; run #107 (10:15Z Oct 6) fires 2h1m
  AFTER elapse → run #107 builds option (a) if no veto. **Correction to run #104's next-run
  note (which said run #108 builds P2-147): that stands — but P2-151's clock differs and run
  #107 builds P2-151.**
- No new defaults proposed this run (no product-surface item built).
