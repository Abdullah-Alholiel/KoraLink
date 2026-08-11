# Gate 0 — Retrospective: Match Lifecycle, My Games, POM Voting UX

Date: 2026-08-11 | Baseline: `a1a4143`

## 1. Commit Pattern Analysis

```
a1a4143 fix(host): auto-populate date/time from slot in koralink mode
91bad6d fix: gate-0 audit — dead LocationMap button, wallet z-index, stale skill
89a06bd feat(seed): add pitch slots for partner venue + fix now declaration (Slice 4+5)
168a9aa feat(host): add SlotPicker + wire 'Book via Us' flow (Slice 3)
20c35f0 feat(host): add ModeToggle + PublishWarningSheet for dual-mode (Slice 2)
```

- **feat:** 3 | **fix:** 2
- **fix:feat ratio:** 0.67:1 — healthy
- Recent fixes were minor audit items, not reactive bug-fixing

## 2. Issue Discovery

### 🔴 CRITICAL (3)

| # | Issue | Root Cause | Impact |
|---|-------|-----------|--------|
| **C1** | **Past matches stay "Open" forever** | No auto-transition mechanism. Matches created at 9 PM are still "Open" at 10 PM. `findNearby` filters them out (WHERE `scheduled_at >= NOW()`), but direct navigation shows them as "Open" with no POM section. | Users see stale "Open" matches on detail pages. Cannot vote for POM. Match never transitions to Completed. |
| **C2** | **Cancelled matches hidden from My Games** | `users.service.ts:155` — `AND m.status != 'Cancelled'` explicitly filters them out | Users can't see matches they cancelled. History is incomplete. |
| **C3** | **POM voting UX is bare inline list** | `PostMatchSection.tsx` renders a plain button list in the scroll body. No confirmation, no team lineup context, no drawer sheet. | Voting feels unstyled — users can tap a name without any confirmation. |

## 3. Affected Files

### Backend
| File | Issue |
|------|-------|
| `matches.service.ts` | No auto-complete logic for past matches |
| `matches.service.ts:643-733` | `castVote` checks `match.status !== 'Completed'` — blocks voting on stale Open matches |
| `users.service.ts:155` | `AND m.status != 'Cancelled'` — hides cancelled matches |

### Frontend
| File | Issue |
|------|-------|
| `match/[id]/page.tsx:261` | Only shows PostMatchSection when `match.status === 'completed'` — stale matches show no POM |
| `PostMatchSection.tsx` | Inline list, no drawer sheet, no confirmation modal |
| `MatchCard.tsx:24` | Treats cancelled as completed (gray button) — correct but My Games hides them |

## 4. Full-Stack Connectivity

| Layer | Status |
|-------|--------|
| DB Schema | ✅ `Completed`, `Cancelled` in `matchStatusEnum`. `completed_at` column exists. `match_votes` table exists. |
| API — findNearby | ⚠️ Filters `scheduled_at >= NOW()` — hides past from feed (correct behavior), but status stays "Open" |
| API — findOne | ⚠️ Returns stale "Open" status for past matches |
| API — castVote | ⚠️ Blocks voting because `match.status !== 'Completed'` |
| API — getPomResult | ⚠️ Returns `not_completed` because status is "Open" |
| API — getMyMatches | 🔴 Filters `status != 'Cancelled'` — cancelled hidden |
| PWA — PostMatchSection | 🔴 Only shown for `completed` status — never triggers for stale matches |

## 5. Recommendation

**Proceed to Gate 1** — all 3 issues are well-understood with clear root causes. The fixes are:
1. **C1**: Add auto-complete logic (query-time + startup job) so past matches transition to Completed
2. **C2**: Remove `AND m.status != 'Cancelled'` filter — one-line fix
3. **C3**: Refactor PostMatchSection into a drawer sheet with team lineup + confirmation popup

fix:feat ratio is healthy — no systemic issues.
