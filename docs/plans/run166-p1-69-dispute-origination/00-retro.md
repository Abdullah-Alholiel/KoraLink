# Run #166 Gate 0 — Retrospective (P1-69 dispute origination, admin-lane rotation)

## Baseline & recent commits
Baseline: `3674ba8` (run #165 close). Since run #165: docs only + the email-lane feature
(PR #179). fix:feat ratio healthy (0 fixes needed last cycle; feat 1, docs 2).

## Area audit (disputes, PWA match-detail, admin console)
- **API dispute origination ALREADY EXISTS**: `POST /matches/:id/dispute`
  (matches.controller.ts:319) → `createDispute` (matches.service.ts:4145-4268) accepts ALL
  5 DisputeType values from ANY roster member (only `no_show` requires an actual no-show
  mark, :4188); idempotent via partial unique index `disputes_open_uidx` +
  `onConflictDoNothing` + evidence-append race recovery; ops ping on create.
- `GET /matches/:id/my-dispute` (:332 → findMyDispute :4318) returns the reporter's latest
  dispute incl. resolved/rejected — the tracking read exists too.
- **PWA gap confirmed**: `useAppeal` (useDisputes.ts) hardcodes `type: 'no_show'`;
  AppealSheet is appeal-only. General categories (double_booking / pitch_condition /
  unrecognized_charge / other) have NO player surface. Match-detail has a moderation
  "Report match" (ReportSheet → /reports) — a different channel.
- **Admin console complete** (Reviewer B run #166): (dashboard)/disputes list + detail,
  resolve/message/venue-decision DTOs, SLA specs. Types expected by console:
  sla_breached, sla_hours_left, sla_deadline, appeal_count, sla_escalated (types.ts:106-126).

## Contract check (Gate 0 pass)
- Mutation return contract: createDispute returns toMyDispute(row) — populated shape ✓
- No bare `.returning()` leaks to players; evidence append is FOR UPDATE + status-predicated ✓
- Standing bug classes in scope: none found (Reviewer A run #166: no ::uuid, no eq(col,null),
  no console.* in API; hex check PASS).

## Admin state check (Phase 3.5 step 0 — MANDATORY, admin lane run)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin`
  → CLEAN (no in-flight owner work). Admin service active. Disputes routes exist NOW.
- Item does NOT touch apps/admin (console already complete; OUT per plan doc).

## Decision records consulted (DECISIONS.md first)
- P1-69 taxonomy default ACCEPTED by owner 2026-10-25 (veto window closed early) → existing
  DisputeType enum, zero schema change. Ledger row present. No contradicting standard.
- Money side-effects stay OUT (P1-29 blocked on P0-2 PSP) — decision refund/compensation
  text is display-only, no money path touched.

## Findings → cascade
1. Players cannot file double_booking/pitch_condition/unrecognized_charge/other disputes →
   a player charged for a broken pitch emails support (or nothing) → admin console starved
   of the very tickets it was built to triage.
2. Once filed, no player-visible status (for non-no_show types) → "did anyone see this?"
   → duplicate contacts, trust erosion.
3. P1-52 Neon quota count now 43/24h (Sentry, was 41 at run #165 close) — still escalating,
   owner billing action unchanged. PR #178 found CONFLICTING this run (fixed — see report).

## Verdict
PROCEED to Gate 4 directly: Gates 1-3 were compacted in run #164's default proposal
(01-default-proposal.md) + owner acceptance; this run's 01-program-design.md pins the
final contract. Tracer bullet = category-picking sheet posting the EXISTING endpoint.
