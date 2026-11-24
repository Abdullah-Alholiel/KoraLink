# Run #227 — Gate 0 Retro: P2-400 part 2 (Admin RBAC can() sweep)

**Rotation:** 227 % 4 = 3 → DB & Infra lane. Reviewer A swept DB/Infra: journal 63 entries
contiguous (v7, when strictly increasing, 0061 tip `d486b120←1191faec`), tripwire specs 8/8,
zero ::uuid casts, zero eq(col,null), zero bare ILIKE, zero console.* in API src, hex clean
@355/27/1. **No DB/Infra build work needed this run** → picked the P1-class row instead.

**Area audit (apps/admin):**
- ADMIN STATE CHECK: `git status apps/admin` CLEAN; service active; last admin commit
  9d52709a (run #226). No owner in-flight work — item buildable.
- RBAC: `can()` wired on only 2/25 pages (disputes/[id]:81-82, settings:45).
  **rbac.ts ALREADY DEFINES all needed tokens** (`settlement.pay`, `settlement.generate`,
  `transaction.refund`, `match.edit`, `match.cancel`, `venue.approve`, `user.ban/suspend/setRole`,
  `report.resolve/reopen`, `pitch.*`, `venue.create`) in ACTIONS_BY_ROLE — the gap is pure wiring.
- **Premise-stale finding (claims≠facts, run #227): P2-400(f) "money formatting hand-rolled, no
  thousands separators" is FALSE — `formatMoney` (lib/utils.ts:16-23) already uses
  `toLocaleString('en-US', { maximumFractionDigits: 2 })`. Sub-item dropped, row updated.**
- (d) LoadError raw-reason line: Reviewer B #227 re-read — localized title+hint+retry already
  present, raw reason demoted to a muted dir="ltr" ops line. Deliberate ops-traceability
  tradeoff (matches partner payout-request precedent PR #263). NOT building; recorded.

**Tech debt pattern:** write surfaces keep landing without capability gates because the tokens
exist but nothing enforces wiring. Fix includes a **parity tripwire spec** so the next
mutation-bearing page either wires `can()` or the census fails.

**Decision:** scope = (c) wiring sweep + (e) section-list single-source + tripwire specs.
(f) dropped premise-stale; (d) recorded as accepted.
