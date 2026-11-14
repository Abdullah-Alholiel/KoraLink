# Run #158 — Gate 0 Retro (P2-244: auto-cancel slot-refund unification)

**Scope audited:** `apps/api/src/modules/matches/matches.service.ts` (auto-cancel money
block), `match-fees.ts` (creditWalletTx contract), the five auto-cancel specs.

**Contracts & recent commits:**
- Run #157 (PR #165, `4dff44c`) rebuilt `creditWalletTx` with replay pre-check +
  guarded balance increment + 23505→409. Board row P2-242 records it as verified.
- The auto-cancel koralink-slot host refund (matches.service.ts ~925) was still a
  hand-rolled `transactions` INSERT + unguarded `users.wallet_balance` UPDATE —
  the last raw money block of the run-#20 generation (P2-244).
- Admin state check (rotation lane = admin, 158%4=2): `git status apps/admin` +
  partner/admin modules CLEAN; admin service active; 13 dashboard routes; no open
  admin-owned in-flight work → admin items eligible (none picked: P2-245 needs a
  Gate cycle, bigger than remaining budget after this item).

**DECISIONS.md consulted (Gate-0 supremacy):** no owner standard touches this
refactor (internal money-mechanics unification, no UX/design change). No defaults
with live veto clocks are affected.

**Tech-debt findings this cycle (from reviewers + self):**
- Reviewer A (admin lane): 0 CRITICAL / 0 IMPORTANT / 4 MINOR (settlement insert
  batching ×2, bulk-moderation serial updates, metrics throttle) — logged as the
  P2-241-style pickup-lane note; no drive-by fixes.
- Reviewer B: run-#157 claims all 4 VERIFIED (see run report).
- Hex lane: clean (10/10 metrics flat vs baseline 283).

**Fix:feat ratio:** healthy — this cycle is a targeted unification (fix-class) of a
boarded defect, not a reactive loop.

**Proceed to Gate 1:** yes.
