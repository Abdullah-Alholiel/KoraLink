# Gate 0 — Retro: P2-332 refund window (run #202)

**Baseline:** 9901f41 (run #201, PR #240 merged). Fix:feat last 15 commits = 4 fix / 4 feat — healthy, no reactive loop.

## ADMIN STATE CHECK (202%4=2 admin lane)
`git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → **clean**; admin svc active.
**LANE CHANGE:** the owner decision on P2-332 (2026-11-11, Life OS D-20261110-06: "Full refund until 12h
before slot, then forfeit, platform-wide") landed uncommitted in kanban/DECISIONS.md + OWNER-QUEUE.md —
the run's top pick moves from admin polish to this owner-decided money rule (owner decisions outrank
lane rotation; admin items P2-335/P2-336/P2-337 shipped in #198/#199 already). Admin stays untouched.

## New owner decision (Gate-0 supremacy: DECISIONS.md first)
| Date | Decision | Anchor |
|---|---|---|
| 2026-11-11 | P2-332 cancel window + refund rule → **full refund until 12h before slot, then forfeit, platform-wide** | Life OS portal D-20261110-06 (uncommitted sibling edit, verified diff) |

**Claims≠facts correction (vs BOARD.md P2-332 row + Reviewer B #197):** "no deadline logic anywhere"
was STALE. A 4-hour conditional-refund engine already exists (slice 4, player-host-responsibility cycle):
`REFUND_WINDOW_HOURS = 4` (apps/api/src/common/constants.ts:12) consumed at matches.service.ts:1967,
decision-table pinned by matches.refund-matrix.spec.ts:41 (`toBe(4)`), ToS + post-leave copy in the PWA.
Inside the window the fee is refunded ONLY if a waitlisted player backfills; otherwise forfeited to the
host (`host-forfeit-<episodeId>` ADJUSTMENT). The owner decision therefore = **extend boundary 4h → 12h**;
the backfill exception and forfeit engine stay.

**Owner-confirmation flagged (proposed-default read, 48h-veto):** the decision line does not address the
inside-window backfill exception (owner's own earlier verbatim rule: "if there are people waiting, player
can get refunded fully" — matches.refund-matrix.spec.ts:19-20). Removing it would silently regress player
outcomes (leave at 2h with a queue = forfeit instead of refund). Default: KEEP the exception; window 12h.
Veto within 48h → set the strict shape (no backfill exception) in a follow-up.

## Findings (this cycle's area)
| Class | Finding | Evidence | Cascade |
|---|---|---|---|
| IMPORTANT | Copy/engine drift if constant flips alone — 4 surfaces still say "4 hours" + a 5th static fallback says "2+ hours" | refund.leftForfeited + matchDetail.playerHostedPayoutNotePlayer + legal.termsRefund{Title,Desc} (en/ar messages); matchRules.refund.body (en/ar, pre-existing 2h-vs-4h contradiction) | Player reads 4h in UI, API forfeits at 12h → trust loss on money copy |
| IMPORTANT | removePlayer lacks a `Cancelled` guard (leaveMatch has one, :1900-1921) | matches.service.ts:4064 guards only InProgress/Completed | Host mutates the audit roster of a cancelled match; kick refund is a no-op (fee already swept) but roster rows vanish |
| MINOR | Eviction-collection asymmetry in leaveMatch's ≥12h branch | matches.service.ts:1987 `evicted = result?.evicted ?? evicted` (overwrite) vs `.concat` elsewhere | Safe today (one promote call per path); asymmetric if a second promote ever lands after it |
| VERIFIED-GOOD | Money sweeps read persisted snapshots only; every path takes the match-row FOR UPDATE first; host-kick refunds 100% (never forfeits) | matches.service.ts:1962/3422/946; :862-877/:3307-3326; :4092-4106 | — |
| STAGING-DATA | `app_settings.refund_policy` = stale test string ("Instant-propagation test policy") — overrides MatchRulesSheet's static refund body | live DB query, run #202 | Players see a test string as the refund policy until the owner sets the real text (admin-editable; owner action, not factory) |

**Proceed to Gate 4:** yes — vertical slice: constant + comment + decision-table spec + 5 copy keys ×2
locales + removePlayer guard + eviction-consistency, one lane PR.
