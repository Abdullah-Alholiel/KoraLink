# POTM push delivery-preference fix (P2-27) — Gates 1-3 compact

## Gate 1 — Product
**Problem:** A player who mutes pushes or sets quiet hours (23→07) still gets the
"🏆 Player of the Match" push at 3am once VAPID keys are configured — the only push path
that ignores preferences.
**User story:** As a player, every push I receive respects my mute/quiet-hours settings.
**In scope:** route POTM web-push through the P1-20 preference-filtered path; keep WS
broadcast + in-app activity untouched (realtime is not a push).
**Out of scope:** push text localization (P2-8), quiet-hours category exceptions (Abdullah
decision, P2-25), VAPID provisioning.
**Success criteria:** muted user gets 0 POTM sends; quiet-window user gets 0 during window;
unrestricted user still gets the push; subscriber's stored locale lands in the payload.

## Gate 2 — Architecture
Single file change in `notifications.service.ts` + spec:
- Replace `getMatchSubscriptions` raw `db.execute(sql...)` with a Drizzle select of roster
  user IDs (`match_players` ⨝ `push_subscriptions`, DISTINCT) → feed `sendPushToUsers`.
- `sendPushToUsers` already: skips `push_muted`, skips enabled quiet windows (Riyadh-local),
  injects per-subscription `locale`, prunes 404/410 endpoints.
- `sendPomDecidedNotification(matchId, payload)` keeps its signature; builds the same
  title/body + `data: { type:'pom-decided', matchId }` (dead `winnerId` dropped — PWA reads
  `type`+`matchId` only, worker/index.js:25).
- Only caller (matches.service.ts:2470) and payload shape unchanged → no contract change.
Data flow: matches service → sendPomDecidedNotification → roster IDs → sendPushToUsers → web-push.

## Gate 3 — Program design (contracts)
**TS signatures:**
```ts
private async getMatchRosterUserIds(matchId: string): Promise<string[]>
async sendPomDecidedNotification(matchId, payload: { matchId: string; winner: {…}; voteCount: number }): Promise<number>
// sendPushToUsers(userIds: string[], payload: { title; body; data: { type; matchId?; conversationId? } }): Promise<number> — unchanged
```
**Exact JSON the POTM push now delivers** (body → SW `event.data.json()`):
```json
{ "title": "🏆 Player of the Match",
  "body": "<winner fullName> was voted Player of the Match!",
  "data": { "type": "pom-decided", "matchId": "<id>", "locale": "<sub.locale|en>" } }
```
`winnerId` removed from `data` (verified unused: grep winnerId on PWA → 0 consumers).

### Contract verification checklist (Gate 3 — explicit)
- [x] Every mutation endpoint returns populated object — N/A (no API mutation changed).
- [x] Frontend types accept backend JSON — PWA consumes push `data.type`/`data.matchId`
      (`worker/index.js:25`) and `data.locale` (P1-5); all three present. `winnerId` has 0
      consumers (grep-verified) → safe removal.
- [x] Adapter functions exist — N/A (no new API shape; WS payload unchanged).
- [x] No field silently undefined — `locale` now always set (was missing → SW defaulted en).
- [x] i18n keys both languages — push copy is plain-text by design (P2-8 tracks localization);
      no new UI strings; en/ar catalogs untouched → parity unchanged (656/656).
