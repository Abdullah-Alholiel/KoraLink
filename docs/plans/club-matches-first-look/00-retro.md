# Gate 0 — Retrospective: Club "Available Matches" First-Look

**Cycle:** `club-matches-first-look`
**Baseline:** `ee85572` (HEAD, main)
**Date:** 2026-08-16

## 1. Commit pattern

```
git log --oneline -20
ee85572 fix(pwa): stabilize iOS bottom sheets
3da3cdd fix(pwa): hide WhatsApp invite CTA after the game ends
cd8d766 feat(potm): return authoritative voting_closes_at from feed queries
168f98c fix(potm): derive voting window from effective completion time
17cb8ef feat(pwa): optimistic chat send with reconciliation and retry UX
...
```

**fix:feat ratio (last 30):** 12 fix : 13 feat = **0.92:1** → under the 1.5:1 reactive-fix threshold. Healthy.

## 2. Full-stack connectivity audit (DB → API → adapter → component → UI)

Traced the club detail "Available Matches" section end-to-end:

| Layer | File | Current state |
|-------|------|---------------|
| DB | `apps/api/.../matches.service.ts:findNearby` | `venue_id` present → WHERE status filter is `TRUE` (no status/time filter) |
| API | `GET /matches?venue_id=&date=` | Returns raw `NearbyMatchRow[]`, ordered `scheduled_at ASC` (no coords) |
| Adapter | `lib/api-adapter.ts:adaptMatchList` | Maps to `Match[]` incl. `date: dateInRiyadh(scheduled)` |
| Hook | `hooks/useMatches.ts` | `date: null` → no `date` param → ALL matches; `date: string` → filtered |
| Component | `clubs/[id]/page.tsx` | Defaults `selectedDate = new Date()` (TODAY), renders FLAT `matches.map(MatchCard)` |
| UI | — | No day/date breakers; cards always show default "Join" (no `currentUserId`) |

## 3. Findings

### F1 — CRITICAL — Club first-look diverges from Play first-look (the feature)
`clubs/[id]/page.tsx` seeds `selectedDate = new Date()` and fetches `{ date: today, venue_id }`.
Result: on first open the user sees **only today's matches in a flat list**, unlike the Play
feed which shows **all upcoming matches grouped by day with a "day name, number month year"
breaker** (`MatchDateSections`). This is the requested feature: the club first-look must match
the Play first-look (all games + day/date breakers), with "View Calendar" narrowing to one day.

### F2 — IMPORTANT — UTC date boundary bug
`const dateStr = selectedDate.toISOString().slice(0, 10)` uses **UTC**, not Asia/Riyadh.
Between 00:00–03:00 Riyadh, `toISOString()` resolves to the previous UTC day → the club page
filters for the wrong day. Play uses `dateInRiyadh()` for exactly this reason.

### F3 — IMPORTANT — Cards render without auth context
The club page calls `<MatchCard match={match} />` with **no `currentUserId`**, so `isUserHost`
/ `isJoined` / POTM-vote state always fall through to the default "Join" button — even for a
user's own match or a match they already joined. Play passes `currentUserId` from Zustand.

### F4 — IMPORTANT — Backend leak: past matches would surface in "all games"
`findNearby` uses `venue_id ? sql`TRUE`` — so once the club page stops always passing a `date`,
"all games" (no date) returns a venue's **entire history incl. completed/cancelled matches**
(up to LIMIT 50). "Available matches" must mirror the discovery feed's upcoming/POTM set.

### Cascade
F4 + F1 → first-look "available matches" would interleave weeks-old completed games. F2 →
matches near midnight mislabeled to the wrong day. F3 → joined/hosted matches look joinable.

## 4. Recommendation
Proceed to Gate 1. Scope is one backend WHERE fix + one page rewrite (reuse `MatchDateSections`),
two i18n keys, one new test. No schema/migration/seed churn.
