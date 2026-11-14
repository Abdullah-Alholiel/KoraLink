# Run #173 — Gate 0 Retrospective (cycle: P1-29 dispute refund side-effect)

**Cycle item:** P1-29 — dispute resolution moves no money (admin/disputes.service.ts:86 "defers it").
**Unblock:** owner P0-2 decision 2026-10-25 (PSP = Moyasar sandbox-first, PR #185 merged 8a721b1)
created the real money map — `transactions` ledger with idempotency keys, wallet balance,
`creditWalletTx` in-tx primitive. P1-29's blocker ("needs P0-2 money-path decision") is cleared.

## Admin state check (mandatory — item touches apps/admin + admin API)
- `git status --short apps/admin apps/api/src/modules/admin apps/api/src/modules/partner` → CLEAN
- `git log --oneline -8 -- apps/admin` → 82c09b8 (photos, #186) newest; nothing in-flight
- `systemctl --user is-active koralink-admin.service` → active
- Verdict: GO. No Abdullah in-flight work anywhere on the touched surface.

## Recent-commit audit (fix:feat)
Last 12 code commits: 57b46ca, 7531405, 8a721b1, 4c63ab6, 82c09b8, c5a85c3, ac7f933,
6bede5d, 31d867f (P2-258), 1ba97e5, 0972a3a, a9f663c → 2 fix-ish / 10 feat — healthy.

## DECISIONS.md (read FIRST — supremacy)
- PSP decided: Moyasar sandbox-first (2026-10-25). No design/UX conflicts with the ledger.
- Admin Drawer RIGHT in both locales — untouched by this cycle.
- No default+48h-veto row is being built this run (P1-29 was a plain TODO row unblocked by an
  owner decision, not a defaulted proposal).

## Tech debt in the exact area touched
1. `resolve()` already has the ONE-tx guarded pattern (run-#24 fix) — the refund rides it;
   no structural debt to repay first.
2. Money-sweep tripwire (skill): every Cancelled/Completed writer sweeps — resolve() adds a
   CREDIT, not a status writer; no sweep coupling.
3. Reviewer A #173 MINORs on Moyasar verify (currency_mismatch code, intent-status predicate,
   DTO IsUUID) — boarded as pickup (P2-248 convention), NOT drive-by fixed.

## Full-stack connectivity audit (chain for this feature)
- DB: `transactions` (idempotency_key UNIQUE, REFUND ReferenceType) exists — migration 0002+ era. No new migration needed.
- API: `creditWalletTx(tx, userId, amt, key, 'REFUND', matchId)` (matches/match-fees.ts) — shared money primitive, used by cancelMatch refunds (precedent: `refund-join-<mpId>` keys).
- Admin: `(dashboard)/disputes/[id]/page.tsx` resolve form posts outcome/decision/internalNote — one new optional field.
- Player PWA: wallet page already renders REFUND ledger rows — zero player-side change (data flows free).

## Findings → affected stories
- Without this slice: admin resolves an unrecognized_charge/pitch_condition dispute → player
  compensated verbally / out-of-band; wallet shows nothing; support dead-end persists (P1-29).
- Recommendation: proceed to Gate 4 (docs compact per autonomous mode).
