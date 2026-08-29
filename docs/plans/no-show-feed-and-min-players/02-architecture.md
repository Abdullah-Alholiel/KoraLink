# Gate 2 — Architecture: no-show feed accuracy + minimum-players guarantee

## Data flow

```
[Bug A]
host toggles no-show → MatchesService.markNoShow()
  ├─ guard: targetUserId === hostId → 400 BadRequest (NEW)
  └─ activitiesService.record({ verb:'no_show_marked', recipients:[target], excludeActor:false })
       └─ record() (NEW hard rule): verb === 'no_show_marked' → drop actorId from recipients  ← choke-point fix

[Feature B]
Schema: matches.min_players int NOT NULL, computed in createMatch (server-authoritative)
  joinMatch  → count >= min?  (no notify; nudge job handles underfill)
  leaveMatch → count < min?  → host bell + push IMMEDIATELY; reset last_nudge_at → resumes hourly
  Scheduler tick (every 10 min) → checkMinPlayers():
    for Open/Full matches TODAY, total < min_players:
      ├─ scheduled_at ≤ NOW()+1h → AUTO-CANCEL (once): release koralink slot, notify players (bell+push),
      │    verb 'match_auto_cancelled' (DIRECTED)
      └─ else if last_nudge_at IS NULL or < NOW()−1h → host nudge (bell+push), set last_nudge_at=now
    matches at/above min: clear last_nudge_at (re-arm for future drops)
```

## Component changes

| File | Change |
|------|--------|
| `apps/api/src/database/schema.ts` | `matches.min_players` (int, not null, default 0), `matches.last_nudge_at` (timestamptz, null) |
| `apps/api/drizzle/` | generated migration (SQL applied via `db:migrate`) |
| `modules/matches/matches.service.ts` | markNoShow self-guard; createMatch computes min; leaveMatch re-nudge; `checkMinPlayers()` (nudge + auto-cancel) |
| `modules/activities/activities.service.ts` | choke-point: `no_show_marked` never notifies the actor; new verbs `host_underfilled_nudge`, `match_auto_cancelled` |
| `modules/matches/matches.scheduler.ts` | new 10-min cron `check-min-players` |
| PWA `useFeed.ts`, `ActivityCard.tsx`, `NotificationSheet.tsx`, `NotificationProvider.tsx` | 2 new verb entries each (icons + i18n keys + toast copy) |
| `src/messages/en.json`, `ar.json` | keys (both `feed` + `notifications` blocks) |
| one-time SQL (manual) | delete Omar's 4 bad feed_items + 2 self-disputes |

## New verbs

- `host_underfilled_nudge` — DIRECTED, actor = system (host as actor for display? No: actor = host
  himself is weird in the UI "Omar …" phrasing) → **actor = the match host is the recipient**;
  for system activities there is no human actor. Decision: reuse the host as actor but the UI label
  is self-referential and does not interpolate the name ("Your match still needs X more players").
  This avoids a nullable actor column migration. UI copy never uses `{name}` for these two verbs.
- `match_auto_cancelled` — DIRECTED, recipients = all roster players (bell: "Match was cancelled —
  not enough players joined").

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Nudge spam | hourly cap via `last_nudge_at`, re-armed on reaching min; immediate re-nudge only on leave-below-min |
| Double auto-cancel | guarded UPDATE `WHERE status IN ('Open','Full')` inside tx; rowcount gates notifications |
| Auto-cancel with paid slot | reuse `cancelMatch` refund semantics: release slot; wallet refund when `pitch_cost_sar > 0` (idempotency key `refund-<id>` collides with manual path — acceptable, one refund per match) |
| System notifications with actor=host confuse feed | UI labels for the 2 new verbs do not interpolate actor name |
| Old matches without min_players | default 0 → "no minimum" → no nudges/cancels for legacy rows (safe, no backfill churn) |
