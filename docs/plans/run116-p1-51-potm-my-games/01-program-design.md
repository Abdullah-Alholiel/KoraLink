# Run #116 — P1-51 — Gates 1-3 Program Design (compact)

## Gate 1 — Product spec (compact)
**Problem:** a player's game disappears from actionable view after the 24h POTM window;
the match outcome (Player of the Match) is invisible everywhere except opening each match
detail. History rows are dead ends.
**User story:** As a player, when I open My Games → History, I see who won POTM on each
completed match I played/hosted (or "no winner" when voting tied/had no votes) at a glance,
and while voting is still open the card already routes me to vote (existing behavior).
**Scope:** IN — extend `GET /users/me/matches` SQL with 3 POTM outcome fields; adapter +
`Match` type extension; MatchCard History-row POTM winner pill; i18n EN+AR; tests.
OUT — no new rating entity, no new endpoints, no email/push changes, no detail-page changes
(PostMatchSection already renders full results), no admin surface.
**Success criteria:** History card of a completed played match shows winner name +
"Crown POTM" pill; tie/no-vote matches show "Voting ended — no winner"; build + vitest +
jest green; live E2E probe proves the fields flow DB→API→adapter→card.

## Gate 2 — Architecture (compact)
Data flow (existing, extended): `matches.pom_winner_id/pom_announced_at` →
`users.service.getMyMatches` SQL (LEFT JOIN users ON pom_winner → winner_name/avatar)
→ `NearbyMatchApi` (3 optional fields) → `adaptNearbyMatch` (passes to `Match`) →
MatchCard render branch (`completed && !votingOpenFinal`).
Files changed:
| File | Change |
|---|---|
| apps/api/src/modules/users/users.service.ts | +3 SELECT columns + row-type fields (getMyMatches only) |
| apps/player-pwa/src/lib/api-adapter.ts | NearbyMatchApi +3 optional; adaptNearbyMatch maps potm fields |
| apps/player-pwa/src/types/index.ts (or wherever Match lives) | +2 optional fields |
| apps/player-pwa/src/components/matches/MatchCard.tsx | History POTM pill branch |
| apps/player-pwa/src/messages/en.json / ar.json | +4 matchCard.* keys |
| test/components/MatchCard.test.tsx | +4 cases |
| apps/api/src/modules/matches/matches.service.ts | docstring fix only (:449-452 tie rule) |

## Gate 3 — Exact contracts (the critical gate)

### API JSON — `GET /users/me/matches` (array rows; each row GAINS):
```json
{
  "id": "m1", "...existing fields": true,
  "has_voted": true,
  "voting_closes_at": "2026-10-10T22:00:00.000Z",
  "potm_winner_id": "u9 | null",
  "potm_winner_name": "Fahad Alqahtani | null",
  "potm_winner_avatar": "https://... | null",
  "potm_decided": true
}
```
- `potm_winner_id/name/avatar`: LEFT JOIN `users u2 ON u2.id = m.pom_winner_id` —
  NULL until the sweep announces. `pom_winner_id` is a varchar(36) user id or NULL.
- `potm_decided`: `(m.pom_winner_id IS NOT NULL OR m.pom_announced_at IS NOT NULL)` —
  true = window resolved (winner OR tie/no-vote stamped); false = still counting.
- No mutation endpoints touched → mutation-return contract not implicated.
- Service method return type: same array, widened row type (3 new optional-ish fields;
  potm_winner_* may be null).

### TS signatures
```ts
// users.service.ts (widened row type only — same signature)
async getMyMatches(userId: string): Promise<Array<{ /* existing */ }>>
//  + potm_winner_id: string | null; potm_winner_name: string | null;
//  + potm_winner_avatar: string | null; potm_decided: boolean;

// api-adapter.ts
export interface NearbyMatchApi {
  /* existing */
  potm_winner_id?: string | null;
  potm_winner_name?: string | null;
  potm_winner_avatar?: string | null;
  potm_decided?: boolean;
}
// Match (types): potmWinnerName?: string | null; potmWinnerAvatar?: string | null;
//               potmDecided?: boolean;   (potm_winner_id not needed by UI)
```

### MatchCard render contract (completed, user played/hosted, window CLOSED)
| pom state | pill |
|---|---|
| potmDecided && potmWinnerName | 👑 `{potmWinnerName}` — brand-amber pill `matchCard.potmWinner` |
| potmDecided && !winner | gray pill `matchCard.potmNoWinner` |
| !potmDecided (stale client clock) | plain View Details (existing) |
In-window rows keep the EXISTING vote/voted pills — untouched.
Card stays a full-card Link to detail (results live there) — pill is display-only, no
nested interactive (a11y: text inside link, no button-in-link).

### i18n keys (EN / AR — atomic, both files)
- `matchCard.potmWinner`: `"POTM: {name}"` / `"أفضل لاعب: {name}"`
- `matchCard.potmNoWinner`: `"Voting ended — no winner"` / `"انتهى التصويت — لا يوجد فائز"`

### Gate 3 contract checklist (explicit)
- [✓] No mutation changed → findOne contract untouched.
- [✓] Frontend types accept exact backend JSON: 3 new optional fields on NearbyMatchApi
      (null-able), adapter maps with ?? fallbacks — no silent-undefined crash path.
- [✓] Adapter covers every consumed shape: MatchCard reads only adapted Match fields.
- [✓] i18n: 2 keys × 2 files, added atomically; parity checker (i18n.test.ts) enforces.
- [✓] SQL: additive columns only; ::text-safe (no new casts needed — JOIN on raw column);
      GROUP BY untouched (pom fields are functionally dependent on m.id via m.* group).
- [✓] No migration: pom_winner_id/pom_announced_at already live (schema.ts:448-450).
