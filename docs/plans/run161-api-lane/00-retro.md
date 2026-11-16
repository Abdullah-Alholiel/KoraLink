# Run #161 — Gate 0-3 Compact (API modules lane)

## Gate 0 — Retro
- Ledger read: kanban/DECISIONS.md — no design/UX conflict (both items are API surfaces).
- fix:feat ratio last 15: healthy (< 1.5:1).
- Prior-run claims: all 3 run-#160 in_review items VERIFIED by Reviewer B + parent.

## Item 1 — P2-244b: cancelMatch host slot-refund onto creditWalletTx (hardening)
- Problem: cancelMatch hand-rolls the host credit (UPDATE users.wallet_balance + plain
  INSERT transactions keyed refund-<matchId>, matches.service.ts:3372-3387) instead of
  creditWalletTx — no replay pre-check (racing second cancel hits raw 23505), no
  user-existence guard (vanished user = ledger commits with zero balance movement).
  P2-244 (run #158) fixed ONLY the auto-cancel path (:925-938).
- User story: as a host cancelling a koralink-booked match, my refund behaves like every
  other refund in the money engine — idempotent on retry, never a ledger/balance divergence.
- Scope: replace the hand-rolled block with creditWalletTx(tx, userId, refundSar,
  refund-<matchId>, REFUND, matchId). Key + amounts unchanged. OUT: UI, endpoint shapes, i18n.
- Success criteria: identical ledger rows on happy path; 23505 → 409 not 500 (defense in
  depth vs the removePlayer race class); vanished-user rolls back the whole cancel tx.
- Double-credit: NOT reachable today (guarded status flip :3276-3291 returns 0 rows → 409
  before any side effect) — this is consistency + defense-in-depth, matching P2-244's framing.

## Item 2 — P2-246: partner bulk slot blackout (user-visible, API-first slice)
- Problem: partner has POST pitches/:id/slots/generate but no bulk close; a venue closing
  for maintenance (Ramadan) edits slots one by one while stale bookable slots keep selling.
- User story: as a partner closing a court for maintenance, I close every slot in a date
  range in ONE call so players never see bookable slots that cannot be honored.
- POV guard (code-read): instance slots are full-match containers (22 max_players) consumed
  via matches.booking_slot_id; pitch_slot_series + generate exist for recurring. Both close
  one-by-one today. Blackout = bulk apply of the close operation, booked slots SKIPPED
  (no money side effects from this endpoint — releasing booked slots stays the cancel path).
- Scope IN: POST /partner/pitches/:id/slots/blackout — body { from, to, mode:
  'instances' | 'series' | 'all' }. instances = only FREE slots (is_booked=false) in range
  closed. series = series rows overlapping range closed + their FREE instances closed.
  all = union. Partner ownership enforced (404 on foreign pitch, same as existing routes).
- Scope OUT: PWA/partner-console UI (partner console has no slots surface yet; API-first per
  the board row; UI adoption = follow-up row), booked-slot eviction, P2-234 pairing.
- Success criteria: free slots in range closed in one call; booked untouched (counts in
  response: closedInstances, skippedBooked, closedSeries); ownership 403/404 correct;
  jest specs pin the contract.
