# Run #22 — Cycle Program Design (compact, autonomous mode)

Cycle: notifications reachability (P2-34) + admin refund guard (Reviewer A) + admin dashboard i18n (Reviewer A).

## Item 1 — Admin refund double-refund guard (data integrity)

**Problem (Reviewer A, run #22, evidence `transactions.service.ts:69-99`):** `refund()` pre-checks
`type==='DEBIT' && status==='Completed'` OUTSIDE any transaction (:70-74). The in-tx
`UPDATE ... SET status='Reversed' WHERE id` (:90-93) never re-asserts status. Two concurrent
refund calls for the same debit BOTH pass the pre-check; the loser then hits the
`refund-<id>` idempotency unique index as a raw 500 — and any future refactor that drops that
key would double-credit. Same class as run #20's cancelMatch FOR UPDATE fix.

**Fix:** inside `db.transaction`: `SELECT id, status FROM transactions WHERE id = $1::text FOR UPDATE`
→ re-throw BadRequest if row missing/status ≠ 'Completed'; insert the CREDIT with
`.onConflictDoNothing()` + `.returning({id})` — zero rows returned = concurrent refund won →
throw BadRequest (tx rollback, zero side effects); only the winner marks Reversed + credits the
wallet. Pre-check stays (fast 400 for already-refunded requests without opening a tx).

**Contract:** same return as before (`findOne(refundId)` populated, outside tx); new failure mode
400 for the concurrent loser instead of 500.

**Spec:** `transactions.refund.spec.ts` — (1) happy path: CREDIT inserted with `refund-<id>` key,
Reversed set, wallet credited, audit logged; (2) in-tx status ≠ Completed → BadRequest + ZERO
side effects; (3) concurrent loser (conflict → 0 rows) → BadRequest + no Reversed + no wallet
credit; (4) non-DEBIT pre-check → BadRequest before any tx.

## Item 2 — P2-34: notification bell reachable from every tab

**Problem (Reviewer B + board P2-34, evidence `(main)/page.tsx:97`):** NotificationBell mounts
ONLY on the feed page; play/clubs/my-games/wallet/messages/profile have none. Off the home tab,
players miss invites/refund/no-show notices.

**Fix (per-tab mount, NOT a global overlay):** `(main)` has no shared header — each page renders
its own header row, and pages under `(main)` must not add overlay chrome (pitfall: duplicate
nav). Mount the existing self-contained `NotificationBell` in each page's header row:
play (top bar row), clubs + messages (right of the header), my-games (right of back-row),
wallet (right of back-row), profile (absolute top-end). Zero new components, zero i18n keys
(reuses notifications.title aria-label), zero layout churn.

**Contract:** no double-mount on feed (its own bell stays); sheet z-index handled by
BottomSheet (z-[60]/z-[70]); badge still server-synced (multi-tab safe).

## Item 3 — Admin HQ dashboard i18n (Reviewer A IMPORTANT)

**Problem (evidence `apps/admin/src/app/(dashboard)/dashboard/page.tsx:66-98`):** ~10 hardcoded
English strings (MetricCard labels "Users", "Matches Booked", "Venues", "Completion Rate",
"Total Float Held", "Pending Payouts", "Open Disputes", "Avg Resolution", `dispute rate` sub,
`name="Revenue (SAR)"`) bypass the hq namespace — Arabic users see English on the main dashboard.

**Fix:** add `dashboard.*` keys to `apps/admin/src/messages/en.json` + `ar.json`, wire
`useTranslations('hq')` labels. Reuse existing MetricCard grid; no layout change.

## Gate 3 contract checklist

- [x] Item 1 returns populated findOne(refundId) OUTSIDE tx (unchanged contract)
- [x] Item 1 spec asserts ZERO side effects on both failure paths
- [x] Item 2 reuses existing NotificationBell/NotificationSheet — no API, no new types
- [x] Item 3 keys exist in BOTH en.json + ar.json before code references them
- [x] No DB migration needed (no schema change this cycle)
- [x] No new endpoints (all three items touch existing surfaces only)
