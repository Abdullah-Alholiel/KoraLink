# Run #77 — API lane: P2-109 Riyadh-TZ (built) + verification batch

## Gate 0 — Retrospective (compact)

Baseline: `aa67a33` (run #76 report). Recent commits: PR #35 squash (P2-105 TOCTOU),
PR #32 socket singleton, PR #33 CI gates, reminder ladder (3d4cb7f). Fix:feat ratio
healthy (fixes are review-driven, no reactive loop). P2-105 verified THIS run before
new work (claims ≠ facts): FOR UPDATE at partner.service.ts:476 + single-tx structure
+ 4-case spec + partner jest 27/27 re-run parent-side → **DONE ✅**.

Sentry 24h triage: **P1-52 (Neon quota) stays RESOLVED** — 1C still n=7, lastSeen
2026-09-25T15:00Z (19h+ quiet through 20:00Z + 06:00Z purge ticks). API-B CORS rejects
n=115 lastSeen 25T20:19Z = guard working as designed at error-level → boarded P2-110
(log-level + allowlist note, not a code bug). koralink-web quiet since Sep 14.

Service snapshot: api/pwa/admin active, /health 200, zero journal err entries (5h).

Reviewer findings (A+B, zai glm-5.3-flash, deleg_dab56bc9, 444s+143s — 17th
consecutive clean zai run): A = 0 CRITICAL/IMPORTANT, 6 MINOR; B = P2-105 VERIFIED +
product gaps (deduped: withdraw→P1-27, reminder granularity→P0-5 sub-cycle; NEW:
partner earnings self-service P1-111, refund-visibility P1-112, terminal-status chat
+ mark-read RL + reports DTO + idempotency pattern → P2-111/112/113 + P2-110).

Admin/partner state check: tree clean, no foreign edits, service active → no HOLD.

## Gates 1-3 — P2-109 (compact)

**Problem:** partner dashboard weeklyTrend buckets + generateSlots weekday math used
server-UTC/server-local time while the rest of the partner module (weekRevenue SQL,
createSlot) uses the Riyadh (+03:00 fixed) calendar → late-evening (21:00-23:59
Riyadh) revenue lands on the next UTC day: chart buckets misalign/duplicate vs SQL;
recurring slots can land on the wrong weekday.

**User story:** as a venue partner, my 7-day trend chart and my generated slot
calendar must reflect Riyadh days, consistently.

**Scope:** partner.service.ts only (+new spec). No schema/DTO/controller/wire changes.
**Contract (Gate 3 checklist):**
- [x] weeklyTrend shape unchanged: `Array<{date; bookedSlots; revenue}>`, oldest-first ✓
- [x] No endpoint signature or error-message changes ✓
- [x] Exported helpers (riyadhDateString/addDaysToDateString/riyadhTrendDays) pure +
    injectable nowMs for tests ✓
- [x] No i18n keys touched (server aggregates only) ✓
- [x] Observability: no new failure surface (pure date arithmetic; SQL bounds
    parametrized, not string-interpolated user input) ✓

**Architecture delta:** one Riyadh calendar axis (riyadhTrendDays) drives the JS
buckets AND the weekSlots/weekRevenue SQL windows (`::date` bounds interpreted
`AT TIME ZONE 'Asia/Riyadh'`) — axis and SQL can never disagree about "today".

## Gate 4 — Slice executed

Claude lane (zeroshot run 01a0dd4a, Opus 5.5, 68in/12.3k-out/558.9k-cache tokens,
~6 min). Parent-reviewed diff (untrusted-output rule), then REAL gates parent-side:
tsc 0 · partner jest 34/34 (+7) · turbo 3/3 --force --concurrency=1 (2m26s) ·
vitest 752/752. Lane commit 17db234 → **PR #36**.

## Item 2 — P2-113 (DTO caps, parent-built)

Reviews handed the DTO caps to mirror from cast-vote.dto.ts (UUID-shape @Matches +
@MaxLength(36)): create-report.dto.ts subjectId (bare @IsString — unbounded FK-typed
value) and topup-wallet.dto.ts idempotencyKey (bare string, charset unbounded).
Same shape as run #73's 0638b06 batch; dto-caps.spec extended.

## Lessons (lane ops)

- Lane worktree needs node_modules symlinks at root AND ALL THREE apps (run #76
  recipe said root+apps/*; only api was linked → forced builds failed on admin then
  pwa until linked; cache-hit build was a false pass — always --force in lanes).
- Lane postbuild bounces live services (harmless: projects-dir content unchanged).
