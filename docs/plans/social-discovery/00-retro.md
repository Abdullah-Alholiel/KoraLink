# Gate 0 — Retrospective: Location & Social Discovery Program

**Cycle:** `social-discovery` (location-driven discovery + follow/messaging + activity feed)
**Date:** 2026-08-14
**Baseline:** `main` @ `f48c930` (clean tree, gh authed, npm 10.9.8 / node 22.22.3)

---

## 1. Commit pattern & fix:feat ratio

Last 15 commits (`f48c930` → `edad896`):

| Type | Count |
|------|-------|
| `fix:` | 12 |
| `feat:` | 2 (app icon, match lifecycle) |
| `docs:` | 1 |

**fix:feat ratio ≈ 6:1** — a reactive fix loop. The last two weeks were spent
stabilising UI polish (lineup rendering, POTM, safe-areas, iOS standalone),
not building new capability. This cycle is the first capability-expansion cycle
in a while and must be **vertical-slice driven** so we don't repeat the
"build it all horizontally, then fix for two weeks" pattern.

## 2. Current-state findings (what actually exists vs. what's missing)

### Track A — Location services

**Already built (backend):**
- `matches.service.ts` `findNearby()` computes `distance_m` via
  `ST_Distance(ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography, m.location)`,
  accepts `lat`/`lng`/`radius_km`, sorts `distance_m ASC` when coords present.
- `venues.service.ts` `findAll()` does the same (`ST_DWithin` + `ST_Distance`,
  `distance_m ASC`).
- `GetMatchesDto` + `GetVenuesDto` already accept `lat`, `lng`, `radius_km`
  with class-validator bounds.
- `venues.location` and `matches.location` are PostGIS `geography(Point,4326)`.

**Missing / broken (frontend + data):**
- `useMatches()` does **not** accept `lat`/`lng` — play screen never sends location.
- `useVenues()` accepts `lat`/`lng` but `clubs/page.tsx` calls `useVenues()` with **no args** → `distance_m` is always `null`, no distance badge, no sort.
- **Zero geolocation in the PWA** — `navigator.geolocation` is never referenced
  (`grep` returns nothing). No `useGeolocation` hook, no permission prompt.
- `users` table has **no lat/lng columns** — only `preferred_location` (free text).
  User location cannot be persisted or used as a default.

### Track B — Play screen first-look

- `play/page.tsx` renders `<DatePicker>` with default `fireOnMount=true`, which
  fires `onDateSelect(today)` on mount → `selectedDate = today` → the feed is
  **pre-filtered to today only**. This is the exact opposite of the requested
  "show all games first" behaviour.
- No date-sectioning: matches render as a flat list with no "day name, number
  month year" headers.
- `MatchCard` shows `match.date` (need to confirm format) but there is no
  section-header grouping by calendar day.
- Calendar is one-shot select; no toggle-to-clear behaviour.
- `useMatches` `date` param is a single `YYYY-MM-DD` string — no "all dates,
  grouped" mode, no distance ordering.

### Track C — Follow + Direct Messaging

- **No `follows` table** and zero `follow` references anywhere in the codebase.
- DM tables **exist and are migrated** (`0004_add-personal-messages.sql`):
  `conversations`, `conversation_participants`, `personal_messages` — but there
  is **no `conversations`/`messages` module, service, controller, or WS handler**.
  They are dead tables.
- `users` controller already exposes `GET /users/search`, `GET /users/:id`,
  `GET /users/me`, `PATCH /users/me` — useful primitives for follow/DM.
- Current `messages/page.tsx` renders **match discussions** (`useDiscussions` →
  `GET /users/me/discussions`), not personal DMs. It links non-match discussions
  to `/${locale}/messages/${id}` — **a route that does not exist**.
- WS gateway (`app.gateway.ts`) only supports `join-lobby` + `send-message`
  scoped to `match:<id>` rooms. No DM rooms, no presence, no typing indicators.

### Track D — Activity feed & notification triggers

- `(main)/page.tsx` (the "feed") is a **duplicate of the play screen** — it just
  renders `useMatches()` as cards. There is no activity/event model.
- No `activities`/`notifications` table in schema; the `notifications` module
  only handles Web Push `subscribe`/`unsubscribe` + the POTM push. There are
  **no in-app notification triggers** for joins, new matches, follows, messages.

## 3. CRITICAL cross-cutting risk — secure context & geolocation

`navigator.geolocation` **requires a secure context** (HTTPS or `localhost`).
The PWA is served over **HTTP** on the Tailscale IP
(`100.93.99.24:3000`), the same environment that already broke
`crypto.randomUUID` (worked around via `lib/uuid.ts`).

- On `http://100.93.99.24:3000`, `navigator.geolocation` is **`undefined`** on
  every mobile browser. No polyfill exists — this is a browser platform
  restriction, not a code bug.
- **Mitigation (must be part of Track A):** serve the PWA over HTTPS on Tailscale
  (e.g. `tailscale cert` + `tailscale serve` for `*.ts.net`), or a TLS reverse
  proxy. Localhost dev still works (secure context). This must be called out as
  an infra dependency before any distance feature can work on the phone.

## 4. Classification

| Severity | Finding | Affects |
|----------|---------|---------|
| CRITICAL | No geolocation + HTTP non-secure context | Track A (blocks distance/sort entirely on device) |
| CRITICAL | `play` feed pre-filtered to today (fireOnMount) | Track B (blocks "all games first look") |
| CRITICAL | DM tables exist but no module/controller/WS | Track C (dead foundation) |
| HIGH | No `follows` table | Track C |
| HIGH | Feed is a play-screen duplicate, no activity model | Track D |
| HIGH | `users` has no lat/lng persistence | Track A |
| HIGH | Venue/match `location` may be NULL in seed data | Track A (distance null even when coords sent) |
| MEDIUM | `useMatches` lacks `lat`/`lng`/`radius` params | Track A |
| MEDIUM | `messages/[id]` route referenced but missing | Track C |

## 5. Recommendation

**Proceed to Gate 1.** Four independent tracks with clean seams:
**A (Location) → B (Play first-look) → C (Follow+DM) → D (Activity feed).**
A is the foundation (B's "nearest" sort and D's relevance both consume distance).
C is the largest and most self-contained. D composes A+C+match events.

Build strictly in vertical slices per track — no horizontal "build all four
screens then wire them" approach.
