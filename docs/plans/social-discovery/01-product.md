# Gate 1 — Product Spec: Location & Social Discovery Program

**Cycle:** `social-discovery`
**Date:** 2026-08-14
**Owner:** Abdullah Alholaiel

---

## 1. Problem statement

KoraLink currently shows games and clubs in a flat, non-personalised list. The
feed is a duplicate of the play screen, there is no social graph (follow),
no direct messaging, and no activity/notification model. Location data is
collected by the API but never sent from the client, so "distance from me" and
"nearest first" don't exist. The app must become **location-aware, socially
connected, and activity-driven**.

## 2. Tracks & user stories (priority-ordered)

### Track A — Full location services (P0 — foundation)

- **A1.** As a player, I open Clubs and see every club sorted nearest-first with
  a visible distance badge ("3.2 km").
- **A2.** As a player, I open Play and see every game sorted by distance from me.
- **A3.** As a player, I grant location once; the app remembers my location and
  uses it as the default everywhere (clubs, play, feed).
- **A4.** As a player who denies location, I can still browse (distance hidden,
  no crash, graceful "enable location" affordance).

### Track B — Rich play-screen first look (P0)

- **B1.** Before touching the calendar, the play screen shows **all** upcoming
  games (today, tomorrow, any date), grouped into sections by date using
  "day name, number month year" (e.g. "Friday, 15 August 2026" / Arabic
  "الجمعة، ١٥ أغسطس ٢٠٢٦").
- **B2.** Tapping a calendar day filters to that day's games; the filter stays
  active while any day is selected.
- **B3.** Tapping the selected day again **clears** the filter and returns to
  all games, nearest-first.
- **B4.** Each game card shows its distance from me (when location is available).

### Track C — Follow + direct messaging (P1 — largest scope)

- **C1.** As a player, I can follow/unfollow another player; I see my followers
  and following lists.
- **C2.** As a player, I can start a private 1:1 conversation with another
  player and exchange messages in real time.
- **C3.** As a player, the Messages tab shows my direct conversations (unread
  counts, last message, sender) alongside existing match discussions.
- **C4.** As a player, I receive a real-time notification when someone follows
  me or messages me.

### Track D — Lively activity feed + notification triggers (P1)

- **D1.** As a player, my Feed shows a real activity stream: games created
  near me, games I joined, players I've played with, and clubs I've joined —
  most relevant first (relevance is internal; no on-screen label).
- **D2.** As a player, I get in-app notifications for: match joined, new match
  near me, new follower, direct message, POTM result.
- **D3.** As a player, tapping an activity/notification deep-links to the
  relevant screen (match detail, profile, conversation, club).

## 3. Scope & boundaries

**IN SCOPE**
- Client geolocation hook + permission UX + HTTPS serving prerequisite.
- Distance on clubs + play + feed (backend already computes; we wire it).
- Date-sectioned "all games" play screen with toggle-clear calendar.
- Follow graph (table, endpoints, UI).
- Direct messaging (endpoints, WS rooms, UI) reusing existing migrated tables.
- Activity/notification model + feed screen + triggers + deep links.
- Observability (Sentry/Pino/PostHog) on new endpoints and flows (AGENTS.md §4).

**OUT OF SCOPE (this cycle)**
- Group/conversation messages beyond 1:1 (schema supports participants; defer).
- Message read receipts / typing indicators (P2 follow-up).
- Blocking/reporting users (P2, but schema should not preclude it).
- Push-notification content for every trigger (reuse web-push infra for a
  subset; in-app feed is the primary channel this cycle).
- Venue owner / admin surfaces.

## 4. Success criteria (measurable)

1. Clubs and Play both render a distance badge when location is granted, and
   lists are sorted nearest-first (verified against seeded geo coordinates).
2. Play screen's first paint shows all upcoming games grouped under date
   headers formatted "day name, number month year" in both `ar` and `en`.
3. Calendar select filters; re-select clears; no console errors in either path.
4. A user can follow/unfollow and the count updates immediately; follower list
   is correct after refresh.
5. Two users can exchange 1:1 messages in real time (WS) and history survives
   reload.
6. Feed shows a non-empty, relevant activity stream and deep-links work.
7. `turbo run build` green + `npx vitest run` green at every slice (hard gate).

## 5. Open questions (resolve at Gate 2)

1. **All-games ordering (B):** recommend primary sort = date (soonest first,
   sectioned) with distance as the secondary sort within a date. Alternative:
   distance primary across all games. → **Recommendation: date-sectioned
   primary, distance secondary.**
2. **Location default (A3):** store last-known lat/lng on `users` (two nullable
   columns) vs. a separate `user_locations` table. → **Recommendation: two
   nullable columns (`home_lat`/`home_lng`) on `users` + PATCH /users/me** (simpler, matches existing profile PATCH).
3. **"Nearby" radius:** keep default `radius_km=10` or widen? A city-wide
   default may hide games; recommend exposing a radius that returns "all" when
   no coords and a sane default (e.g. 50 km) when coords present.
4. **Follow notification fan-out:** in-app only this cycle (feed/notifications
   table), defer push for follows/messages to P2.

## 6. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Geolocation blocked on HTTP (Tailscale) | A1–A4 dead on device | Serve PWA over HTTPS (Tailscale cert / TLS proxy) as a Track A dependency |
| Venue/match `location` NULL in seed | distance null, sort degraded | Seed real WGS-84 coords for Riyadh venues + denormalise venue location onto matches |
| DM tables migrated but unused | wasted foundation / drift | Build module against existing schema; no new migration unless needed |
| Scope creep (4 tracks) | horizontal build | Enforce per-track vertical slices, one track at a time |
| RTL date formatting | Arabic date sections wrong | Use next-intl `useFormatter` / `Intl.DateTimeFormat` with locale, never hand-rolled |
| Relevance ranking ambiguity (D) | "most relevant" undefined | Define explicit relevance score in Gate 3 (recency + distance + social proximity weights) |

## 7. Sequencing (Gate 4 preview)

1. **Slice A1** — geolocation hook + HTTPS prerequisite + clubs distance/sort.
2. **Slice A2** — play distance/sort + location persistence.
3. **Slice B1** — all-games, date-sectioned play screen + toggle-clear calendar.
4. **Slice C1** — follow graph (schema + endpoints + follow/unfollow UI).
5. **Slice C2** — DM endpoints + WS rooms + conversation UI.
6. **Slice D1** — activity model + feed screen + triggers + deep links.
7. **Slice D2** — in-app notifications + observability wiring.

Each slice: `turbo run build` green + `npx vitest run` green before commit.
