# Gate 3 — Program Design (contracts)

## 1. Contract verification checklist (run before Gate 4)

| # | Item | Result |
|---|------|--------|
| 1 | `markNoShow` with `targetUserId === hostId` → 400, zero side effects | ▢ verify in Slice 1 |
| 2 | `record()` drops actor from `no_show_marked` recipients (defense-in-depth) | ▢ verify in Slice 1 |
| 3 | Unmark (`noShow=false`) sends no `no_show_marked` notification | ▢ verify in Slice 1 |
| 4 | Every mutation still returns `this.findOne(id)` (§2 hard rule untouched) | ▢ verify in Slice 2/3 |
| 5 | `checkMinPlayers` auto-cancel is single-shot (guarded UPDATE rowcount) | ▢ verify in Slice 3 |
| 6 | Nudge recipients: exactly `[hostId]`; auto-cancel recipients: roster ∖ none (host included) | ▢ verify in Slice 3 |
| 7 | New verbs in `DIRECTED_VERBS` (bell) AND PWA union + 2 icon maps + 2 label maps + toast copy | ▢ verify in Slice 4 |
| 8 | i18n keys exist in `en.json` AND `ar.json`, in BOTH `feed` + `notifications` blocks | ▢ verify in Slice 4 |
| 9 | New SQL param style: no `::uuid` casts; `varchar(36)` compared with `::text` | ▢ verify in Slice 3 |
| 10 | `db.execute` gets `.toISOString()` strings, never `Date` objects | ▢ verify in Slice 3 |

## 2. API / service contracts

### markNoShow (changed)
```ts
async markNoShow(hostId, matchId, targetUserId, noShow) // → Promise<MatchDetail>
// NEW: if (targetUserId === hostId) throw new BadRequestException(
//   'You cannot mark yourself as a no-show.');
// notification block becomes: if (noShow && wasFlagged !== noShow) { record(...) }
```

### activities.record (changed)
```ts
// inside record(), after recipient dedupe:
const recipients = verb === 'no_show_marked'
  ? recipients.filter(r => r !== actorId)   // a host never notifies himself of his own mark
  : recipients;
```

### createMatch (changed)
```ts
// persisted alongside max_players:
minPlayersFor(maxPlayers: number): number  // even(2n−2), floor 2  → 10→8, 14→12, 22→20, 4→2
// values({ ..., min_players: minPlayersFor(max_players), last_nudge_at: null })
```

### checkMinPlayers() (new, scheduler-driven)
```ts
async checkMinPlayers(): Promise<{ nudged: number; cancelled: number }>
// NUDGE SET (per tick):
//   status IN ('Open','Full')
//   scheduled_at::date = NOW() AT TIME ZONE 'Asia/Riyadh'  (match day, Riyadh tz)
//   scheduled_at > NOW() + interval '61 minutes'           (auto-cancel band handled separately)
//   min_players > 0 AND current_total < min_players        (current_total = COUNT(match_players))
//   (last_nudge_at IS NULL OR last_nudge_at < NOW() − interval '1 hour')
//   → bell(verb 'host_underfilled_nudge', recipients [host], matchId) + web-push to host
//   → UPDATE matches SET last_nudge_at = NOW()
// RE-ARM: matches at/above min with last_nudge_at NOT NULL → last_nudge_at = NULL
//   (covers join-recovery; withdrawal sets the row state directly, below)
// AUTO-CANCEL SET (per tick, ≤ 5/hour band => tick every 10 min never double-fires):
//   status IN ('Open','Full') AND scheduled_at > NOW()
//   scheduled_at ≤ NOW() + interval '60 minutes'
//   min_players > 0 AND current_total < min_players
//   → tx: guarded UPDATE matches SET status='Cancelled' WHERE id=… AND status IN ('Open','Full')
//     → rowcount 0 ⇒ someone cancelled concurrently, skip notify
//     → release koralink slot + refund host (reuse cancelMatch semantics, refund idempotency key refund-<id>)
//   → bell(verb 'match_auto_cancelled', recipients = roster user_ids) + web-push
```

### leaveMatch (changed)
```ts
// after tx, when remaining total < min_players:
//   activitiesService.record({ actorId: userId, verb:'host_underfilled_nudge', matchId,
//                              recipients:[hostId] })  + web-push to host
//   UPDATE matches SET last_nudge_at = NOW()   // immediate nudge counts as this hour's nudge
```

## 3. New activity verbs

| Verb | DIRECTED | Actor | Recipients |
|------|----------|-------|-----------|
| `host_underfilled_nudge` | yes | host id (placeholder; UI copy never shows the name) | host |
| `match_auto_cancelled` | yes | host id (placeholder) | all roster players |

## 4. i18n keys (en / ar, both `feed` + `notifications` blocks)

| Key | en | ar |
|-----|----|----|
| `feed.hostUnderfilledNudge` | "Your match still needs {count} more players — invite them before kick-off" | "مباراتك تحتاج {count} لاعبين إضافيين — قم بدعوتهم قبل انطلاق المباراة" |
| `feed.matchAutoCancelled` | "Match was cancelled — the minimum number of players wasn't reached" | "تم إلغاء المباراة — لم يتم الوصول إلى الحد الأدنى من اللاعبين" |
| `notifications.hostUnderfilledNudge` | same text | same text |
| `notifications.matchAutoCancelled` | same text | same text |

> `{count}` interpolation: `ActivityCard`/`NotificationSheet` pass `count: item.match?.playersNeeded`.
> Requires feed API to include playersNeeded → **extend queryFeed rows** with
> `GREATEST(m.min_players − sub.total, 0) AS players_needed` (lateral count).

## 5. PWA verb plumbing

- `useFeed.ts` ActivityVerb union += `'host_underfilled_nudge' \| 'match_auto_cancelled'`
- `ActivityCard.tsx` VERB_ICON += `host_underfilled_nudge: UserPlus`, `match_auto_cancelled: XCircle`
- `NotificationSheet.tsx` VERB_ICON += `host_underfilled_nudge: Users`, `match_auto_cancelled: XCircle`
- `NotificationProvider.tsx` toast copy += both keys

## 6. Data fix (one-time SQL, run manually after deploy)

```sql
DELETE FROM feed_items fi USING activities a
WHERE fi.activity_id = a.id AND a.verb='no_show_marked'
  AND a.actor_id = fi.recipient_id;               -- self-directed marks only (Omar's 4)
DELETE FROM disputes d WHERE d.type='no_show'
  AND d.reporter_id = d.respondent_id;            -- self-disputes (Omar's 2)
```
