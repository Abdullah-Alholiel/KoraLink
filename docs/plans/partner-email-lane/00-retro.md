# Partner Email Lane — Cycle Retrospective (Gate 0, run #165)

## Scope of this cycle
Owner decision 2026-10-25 (chat, ledger-recorded): partner EMAIL notifications for
**payout / pitch / match-cancellation updates** to partners' registered emails via the
existing MailerModule (P2-214 path-a expansion). This cycle: the API slice.

## Prior-state audit (what landed since the lane was decided)
- `8c0f670` storage deployed (SeaweedFS), `03196b3` owner decisions ledger append — the
  decisions this lane builds on are COMMITTED, not just chatted.
- MailerModule (P1-41, run #35): suppression-gated (verified/muted/ghost), log-only
  without RESEND keys, self-disabling. `payout_paid` template + `EMAIL_ACTIVITY_VERBS`
  mirror already exist (run #141) — **the payout-paid email leg is ALREADY live-wired**
  through `activities.record()`; this cycle closes the remaining two legs.
- Admin state check: `apps/admin` + partner/admin API modules CLEAN (no in-flight
  owner work); admin service active. No admin-area changes in this cycle (API-only).

## Findings from reviewers (merged, run #165)
- Reviewer A: NO CRITICAL. Money-path (PR #176) verified solid. 2 IMPORTANTs are
  by-design residues (cadence-change settlement gap → board note P2-261; serial
  settlement inserts → existing P2-248 pickup). Standing bug-class sweep ALL CLEAN.
- Reviewer B: all 3 prior-run claims VERIFIED live (P2-216 dist+401; P2-257 formatMoney
  + zero glyphs; 0054 journaled). New gaps: push prompt buried (P2-258), notifications
  45s polling (P2-259), wallet offline-vs-failed ambiguity (P2-260).
- Sentry: KORALINK-API-1F (push_subscriptions delete) classified MINOR — it is the same
  Neon quota PostgresError as 1C, not an independent defect.

## DECISIONS.md compliance
- No design/UX change contradicts the ledger. Email copy = what-happened + what-next
  (error-message standard). EN+AR parity in mailer.copy.ts (marketing standard applies
  to email copy too).
- The transport keys (RESEND_API_KEY/MAIL_FROM on Render) are OWNER-ONLY (ledger:
  email keys). Staging ships log-only; behavior activates when the owner adds keys.

## Tech debt touched
- ~~activityVerbEnum gains `payout_requested` (migration 0055)~~ — SUPERSEDED at
  Gate 3 build time: the shipped design (01-program-design.md) is **NO migration,
  NO enum change** (direct `MailerService.sendToUsers`; the choke-point route was
  rejected). Verified against the shipped diff.
- matches.service gains an OPTIONAL MailerService injection (AuditService optional-param
  pattern reused — legacy spec constructions keep compiling).

## Fix:feat ratio
Recent 15 commits: 3 fix / 1 feat / 11 docs — no reactive fix loop. Proceed to Gate 1.
