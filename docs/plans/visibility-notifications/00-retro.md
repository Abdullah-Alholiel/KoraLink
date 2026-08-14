# Cycle: Match Visibility, Host Form Locking, Interactive Feed, Full Notifications & Messaging

**Date:** 2026-08-14 · **Baseline commit:** `fb48cbc` · **Branch:** `main`

## Baseline Verification (Gate 0 entry evidence)

| Check | Result |
|---|---|
| `npm run build` (turbo, root) | ✅ 2/2 tasks successful |
| `npx vitest run` (player-pwa) | ✅ 111/111 tests, 12 files |
| `gh auth status` | ✅ Logged in as Abdullah-Alholiel (classic PAT, repo+workflow) |
| `git status` | ✅ Clean tree |

---

## Part 1 — Root Cause Analysis: "match created by a user doesn't show for other users"

Verified against **live DB** (`dbcheck` script, real rows):

### Finding V1 — CRITICAL: Geo radius hard-excludes matches (THE bug)
`findNearby()` applies `ST_DWithin(m.location, …, radiusMetres)` as a **hard WHERE filter** (matches.service.ts ~L149). Since the location cycle (`7634a48`), the Play page always sends device coords when granted.

**Live proof:** match **"test 4"** (Al-Nakheel Sports Complex, **Jeddah**) → `in_radius: false` for a Riyadh user (24.7136, 46.6753). The match is `Open`, upcoming (Aug 16), fully valid — yet **invisible to every Riyadh-located user**. This is exactly the reported bug: a user creates a match on his own; others (in a different city, or with slightly different coords) never see it.

Secondary effects:
- All 3 seeded venues have locations; any venue/pitch created without a geography point produces `m.location = NULL` → `ST_DWithin(NULL, …) = NULL` → row dropped for **all** geo queries. No error, no empty-state explanation.
- Radius default is 50km — a player in Riyadh will never discover Jeddah/Dammam matches even when browsing "all games".

### Finding V2 — IMPORTANT: Feed shows no "why is it empty" signal
When geo/date filters exclude everything, the UI renders the generic "No matches" empty state. The user cannot tell "no matches exist" from "your 50km radius excludes them". No location-off toggle, no radius picker.

### Finding V3 — MINOR: `scheduled_at::date = ${date}::date` compares in server timezone (UTC)
Riyadh is UTC+3. A 21:00 UTC match (= 00:00 next day Riyadh) sorts/filters into the wrong day. Adapter-side `dateInRiyadh()` already exists and the PWA sends Riyadh-local dates — the SQL should compare in `Asia/Riyadh` too: `(m.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${date}::date`.

### Finding V4 — Note: "test 54" (created 16:28 Riyadh today) is already `already_ended: true`
Not a bug (kickabout ended) — but the feed gives the host zero trace of his own past match on the Play page (by design upcoming-only; My Games covers it). No action.

### Verdict on the user report
The match others couldn't see = geo hard-filter (V1). The fix also needs an explicit **public/private visibility model** (this cycle's feature) so hiding is always *intentional* (private) rather than accidental (geo).

---

## Part 2 — Host form standardisation audit

### Finding H1 — CRITICAL: `format` is decoupled from selected pitch
`HostMatchForm` keeps `format` as free state (`useState<Format>('7v7')`). Choosing an 11v11 pitch leaves the format picker on 7v7 (or any value) → `max_players = 14` on an 11v11 pitch, TeamLineup renders 7 slots/side. Violates the user's requirement: **format must be locked to the pitch's size**.

### Finding H2 — IMPORTANT: Date/time not locked when a pitch (self mode) is chosen
`readOnlyDateTime`/`readOnlyDuration` only engage for `koralink mode + selectedSlot`. In **self mode** the user picks pitch then freely edits date/time — acceptable (self mode = no slot contract), BUT the user requirement says: once pitch **and** slot chosen (koralink), or once pitch chosen (self), the date/time section should present as **locked summary chips** rather than open inputs. Current UI keeps open editable inputs in self mode.

### Finding H3 — MINOR: Mode switch resets venue/pitch/slot/date/time but not format sync
After H1 fix, pitch selection must also drive format; mode switch resets pitch → format must reset to a neutral state tied to the *next* pitch choice.

---

## Part 3 — Feed / notifications / messaging state

### Finding N1 — CRITICAL: No notification icon or unread surface anywhere
Feed page header has **no bell icon**. `useNotifications()` hook exists (`/users/me/notifications`) and a `POST /users/me/notifications/read` endpoint exists — but nothing consumes them in the UI. Zero unread badge, zero sheet.

### Finding N2 — CRITICAL: Notifications are feed_items rows only — no per-notification read state at scale
`activities` + `feed_items` (fan-out-on-write) power the feed. `is_read` lives on feed_items (fine), but there is no `new-notification` WebSocket push, so unread count only updates on refetch. No toast/banner on DM arrival.

### Finding N3 — CRITICAL: DMs don't notify
`handleDm` broadcasts `new-dm` only to `conv:<id>` room (open conversation windows). A recipient not in the room gets **nothing** until he opens Messages. No cross-user `notify` event, no push for DMs (push exists only for POTM).

### Finding N4 — IMPORTANT: Match chat notifications absent
Same as N3 for match lobbies (`new-message` only reaches `match:<id>` room members currently viewing).

### Finding N5 — IMPORTANT: Feed page not interactive
Static list: no pull-to-refresh, no new-items pill, no real-time prepend, no skeleton→content transition polish, no unread divider. Matches user ask "feed is better and more interactive".

### Finding N6 — MINOR: `usePushNotifications` used only on profile page (opt-in toggle); no VAPID keys in env (push disabled gracefully).

---

## Part 4 — fix:feat ratio (last 15 commits)
feat: 6, fix: 6, docs: 3 → 1.0:1 — acceptable (≤1.5), but feed/social cycle shipped with known gaps (D2 partial: real-time feed).

## Classification → user stories cascade
- V1 → "As any player, public matches I'm not in appear in my feed regardless of city" (P0)
- V2 → "Feed explains why it's empty + lets me widen/clear location filter" (P1)
- H1 → "Format/max_players always match the chosen pitch" (P0)
- H2 → "Locked date/time/summary UI once slot/pitch chosen, both modes" (P0)
- N1–N4 → "Full notifications: bell + unread + WS push + toasts for DMs/match chat" (P0)
- N5 → "Interactive feed: pull-to-refresh, live prepend, unread divider" (P1)
- Public/private → "Host chooses visibility; private = invite link only" (P0)

## Recommendation
Proceed to Gate 1 (Product Spec). All findings map cleanly onto the user's requested scope; no blockers. Contract risk is high (visibility column + feed SQL + notifications fan-out) → Gate 3 must lock exact shapes for: `POST /matches` (visibility field), `GET /matches` (visibility-aware), `GET /users/me/notifications`, WS `notification` event, invite-link match access (`GET /matches/:id` guest path).
