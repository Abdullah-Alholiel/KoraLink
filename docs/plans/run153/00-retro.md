# Run #153 — Gate 0 Retrospective (compact)

**Date:** 2026-10-21 ~10:45Z · **Rotation:** 153 % 4 = 1 → API modules (security lens) · **Ledger:** kanban/DECISIONS.md read first — no contradictions this cycle (no design/UX changes proposed).

## Continuity anomaly (resolved)
Run #152's session completed its build (PR #158 squash `d60cdd7`, P2-234) and the board commit
(`f8e292c`) but died BEFORE writing its RUNS report and STATE update — STATE said `last_run: 151`
with no run-152 report file. This fire = **run #153** (numbered from the board's own #152 evidence;
executions.db shows 01:15Z completed + 10:15Z running). Run #152's claims verified: PR #158 MERGED,
`useSlotTapRevalidate` present in source AND built server chunks (579.js.map), PWA service active.

## Recent-cycle audit (last 5 commits)
- `f8e292c` docs board · `d60cdd7` P2-234 slot revalidation (PR #158) · `9fe25cf` docs ·
  `c851747` P2-233 push tags (PR #157) · `9f87f88` P2-231 TTL cache (PR #156).
- fix:feat ratio healthy — recent cycles ship reviewed PRs with PR-Agent rounds triaged.
- No console.log regressions, no `::uuid` casts (Reviewer A sweep confirms), hex audit clean
  (all 10 metrics flat, run 2026-10-21).

## Reviewer findings triaged this cycle (claims ≠ facts verified in code)
- **A-IM1 CONFIRMED:** WS handshake (`app.gateway.ts:186-243`) verifies JWT + moderation + deleted_at
  but NEVER checks `payload.purpose === 'restore'`. REST rejects spent restore tokens on every route
  (`jwt-cookie.strategy.ts:182-197`); the WS layer accepts one as a full session for up to 7 days
  (incl. `ops` room if the account held a staff role). → **P1-53, build this run (security pick).**
- **A-IM2 CONFIRMED:** `completeProfile` (`auth.service.ts:261-269`) check-then-act on a UNIQUE
  column (`users.handle`, schema.ts:221) → concurrent claim loser 500s with raw 23505. → **P2-238.**
- **B-CRITICAL-2 REFUTED:** "PaymentSheet idempotency key never rotates → leave/rejoin replays old
  outcome" — server scopes the fee key per-EPISODE (`join:<episodeId>:<key>`, matches.service.ts:1714);
  `leaveMatch` DELETEs the roster row (matches.service.ts:~1839) and every join INSERTs a fresh
  episode (matches.service.ts:1649-1659), so a stale client key can never collide across episodes.
  Within one episode, key stability IS the designed contract (retry returns original outcome).
  Residual truth: the code comment "only regenerates when the user explicitly re-opens the sheet" is
  inaccurate (regenerates on page remount) — folded into P2-239 as a comment fix.
- **B-CRITICAL-1 REAL but known:** wallet-only paid join + top-up 403 = standing P0-2 (owner-gated).
  No new row; P0-2 user-impact evidence refreshed.
- **B-IMPORTANT-1 = existing P2-228** (joinError discarded → generic copy; line drift :237-240).
  **B-IMPORTANT-2 NEW:** PaymentSheet hardcodes "SAR" — page passes `currency` to the sibling
  booking component but NOT to PaymentSheet (match/[id]/page.tsx:1084-1095). → folded into **P2-239**.
- **B-IMPORTANT-3 NEW:** socket auth token in localStorage (`socket.ts:26,39`) while the gateway
  already accepts the httpOnly cookie (`app.gateway.ts:178-179`) → **P2-240**.
- **A-MINOR cluster** (pagination tiebreakers `conversations.service.ts:238` + `wallet.service.ts:213`,
  `verify-otp` route throttle, devLogin `secure:false`, email 429 retryAfter parity, WS pre-read bound)
  → **P2-241 consolidated backlog row** (never preemptive; pickup when the files next change).

## Tech-debt signals
- P2-230 (gateway pre-read duplication) still open — rides any gateway touch (P1-53 touches the same
  file; do NOT fold — separate concern, keep slices small).
- Neon 1C quota now 18 events/24h with lastSeen 10:00Z (25 min before run start) — P1-52 escalation
  continues (5th run, owner=billing, no factory-side remedy).
