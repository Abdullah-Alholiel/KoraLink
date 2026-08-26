# Program Design — P1-1 Scheduler (@nestjs/schedule)

## Jobs

| Job | Cadence | Guard (idempotency) | Action |
|---|---|---|---|
| `autoCompletePastMatches` | `*/5 * * * *` | WHERE status IN (Open,Full,InProgress) AND end < NOW() | Bulk UPDATE → Completed + completed_at |
| `finalizePomVoting` | `*/5 * * * *` | WHERE pom_winner_id IS NULL AND pom_announced_at IS NULL AND effectiveEnd + 24h < NOW() | Per-match: tally votes (roster, no no-show) → tie = earliest vote wins → `announcePomWinner()` (itself idempotent) |
| `sendMatchStartReminders` | `*/15 * * * *` | WHERE reminders_sent_at IS NULL AND start ∈ [NOW+15m, NOW+45m) AND status IN (Open,Full) | Push "match starting soon" to confirmed attendees; set reminders_sent_at |

## API surface (matches.service.ts additions)

```ts
// Batch POTM finalization for every due match. Returns count finalized.
async finalizePomVoting(): Promise<number>

// Push start reminders to confirmed players of soon-starting matches. Returns count reminded.
async sendMatchStartReminders(): Promise<number>

// (private, extracted from getPomResult) tally votes for one match
private async tallyPomVotes(matchId: string): Promise<{candidate_id, full_name, avatar_url, vote_count}[]>
```

## Schema (migration 0017)

```sql
ALTER TABLE matches ADD COLUMN reminders_sent_at timestamp with time zone;  -- NULL = not reminded
```

## Notifications payload (reminder)

```json
{ "title": "⏰ Match starting soon", "body": "«title» kicks off at «time» — see you there!",
  "data": { "type": "match-chat", "matchId": "…" } }
```
(deep-link reuses the existing match-chat path; i18n of push text is a P2 nicety — the SW
shows server text as-is.)

## Contract verification checklist

- [ ] `@nestjs/schedule` installed; `ScheduleModule.forRoot()` in app.module
- [ ] 3 @Cron jobs registered; each calls the service method; each is WHERE-guarded (no overlap risk)
- [ ] `finalizePomVoting` honors the POTM invariant (winner ∈ roster, no no-show); tie → earliest vote
- [ ] `sendMatchStartReminders` fires once per match (reminders_sent_at guard) to confirmed players only
- [ ] Migration 0017 applied; column live
- [ ] tsc 0 · jest green · turbo build 3/3
- [ ] Manual tick test: run the three methods directly against live DB; verify rows transition + no crash
