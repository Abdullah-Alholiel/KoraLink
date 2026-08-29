# Gate 1 — Product Spec: no-show feed accuracy + minimum-players guarantee

## Problem statements

**A. Feed accuracy bug (fix):** Hosts receive "You were marked as a no-show" notifications for
actions *they themselves* performed (self-mark), and the feed shows a no-show state that never
existed. Omar (host, solo roster) got 4 false notifications + 2 garbage disputes.

**B. Underfilled matches (feature):** Matches routinely start underfilled. The host has no
in-app mechanism that nudges him during match day when total players < the format minimum,
and nothing auto-cancels matches that stayed underfilled.

## Requirements

### A — No-show notification fix (P0)
1. A host can **never** be notified for his own mark action (`excludeActor` semantics: actor never
   lands in recipients for `no_show_marked`).
2. Host cannot mark **himself** as no-show at all (400).
3. Clearing a mark sends **no** "marked" notification.
4. Existing garbage in DB: delete Omar's 4 self-directed `no_show_marked` feed items + 2 auto-opened
   self-disputes (one-time data fix).

### B — Minimum-players guarantee (P0)

Format minimums (total players incl. host, always **even**):
| Format | max_players | min_players |
|--------|------------|-------------|
| 5v5 | 10 | 8 |
| 7v7 | 14 | 12 |
| 11v11 | 22 | 20 |
| n v n | 2n | max(2, even(2n − 2)) = 2n−2 (even by construction) |

1. `min_players` is computed server-side at match creation from `max_players` (even, ≥ max−2),
   persisted on the match row. Hosts cannot set it directly.
2. **Match-day host nudge:** On the day of the match, while total players < min_players, the host
   receives a repeating notification ("invite players until the minimum is reached"), **at most once
   per hour**, and only while the match remains below minimum. Once minimum is reached, nudging stops.
3. **Withdrawal re-nudge:** If a player withdraws (leave) and the total drops back below minimum,
   the host is notified immediately, and hourly nudging resumes.
4. **Auto-cancel:** If a match starts within **1 hour** and is still below minimum, the API
   **automatically cancels it** (status → `Cancelled`) before kick-off. Players are notified
   (bell + push). This is a system cancellation, not a host action — no host approval needed.
5. All notifications use the existing bell (`feed_items`) + web-push plumbing.

## Scope

**IN:** API service/scheduler changes, one schema column + migration, i18n keys (en+ar), PWA verb maps,
one-time DB cleanup for the reported bad data, tests for new logic, build green.

**OUT:** SMS/Unifonic nudges, auto-refunds on auto-cancel (slot is released; wallet refund logic
unchanged), host-facing cancellation approval flow, changes to markNoShow dispute lifecycle.

## Success criteria

- Omar's feed shows zero self-directed no-show notifications after cleanup.
- A host with an underfilled match today receives hourly nudges; reaching min stops them; a
  withdrawal below min re-triggers.
- A match still below min at T−60min is auto-cancelled exactly once, players notified.
- `turbo run build` + `npx vitest run` green.

## Open questions resolved (by user)

- Minimums confirmed by user: 5v5→8, 7v7→12, 11v11→20 (even numbers). Rule generalizes to −2 from max.
- "Before a match with one hour" = at T−60min with underfill → auto-cancel.
