# Feature — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | — | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE (autonomous) | — | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ DONE (autonomous) | — | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ DONE (autonomous) | — | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ DONE | — | below |

**Mode:** user said "proceed autonomously" — gates executed without pauses per
koralink-software-factory autonomous-mode rules.

## Slices (Gate 4)

| Slice | Scope | Commit | Verification |
|---|---|---|---|
| S1 Visibility | enum+migration, soft-geo feed rewrite, invite-link access, toggle, private chip/banner | `378362f` | E2E 9/9 (private hidden/shown, Jeddah public visible from Riyadh coords, nearest-first, link join, default public) |
| S2 Host form | pitch-locked format, collapsed pitch/slot summaries, pitch-derived max_players | `f6a0a9e` | build green + 115 tests |
| S3 Notifications core | RealtimeService user rooms, record() WS fan-out, unread-count, bell+sheet+toasts, nav badge | `78b28d9` | WS E2E: followed→unread=1, messaged→unread=2, markRead→badge-sync 0 |
| S4 Chat+DM notify | match-chat fan-out to absent participants, DM web push, SW push handler | `2cbc567` | E2E: in-room viewer no dup, absent member notified (API unread), namespace adapter fix |
| S5 Feed interactivity | pull-to-refresh, new-activities pill, NEW divider, PostHog events, bell tests | `5f26282` | build green + 118 tests (14 files) |

## Deviations from Gate 3 contracts
- `unread-count` initially returned a bare number; fixed to `{ unreadCount }` per §2.5 before commit.
- Visibility SQL used `BOOL_OR` in WHERE (illegal — aggregates) → replaced with
  `EXISTS` subquery; matches the exists-subquery-pattern reference.

## Deferred (explicit)
- Notification per-type settings screen (next cycle)
- Read receipts / typing indicators
- Invite expiry / revocation
