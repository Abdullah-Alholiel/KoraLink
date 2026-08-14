# Gate 1 — Product Spec

**Cycle:** Match Visibility, Host Form Locking, Interactive Feed, Full Notifications & Messaging
**Status:** ⏸️ PENDING APPROVAL

## Problem Statement

1. **Matches are invisible to other players.** A user creates a match and other users never see it — because the feed applies a 50km geo **hard exclusion** (verified live: Jeddah match invisible to Riyadh users), and there is no public/private model: nothing defines who *should* see a match.
2. **Host form is not standardised.** Format is decoupled from the chosen pitch (11v11 pitch can publish as 7v7); date/time/slot don't collapse into locked summaries once chosen; behaviour differs between "via us" and "by yourself" modes.
3. **Feed is static.** No refresh, no live updates, no unread tracking, no explanation when filters hide everything.
4. **Messaging & notifications are dormant.** DMs and match chat only reach *already-open* screens; there is no notification icon, no unread badge, no in-app notification center, and push exists only for POTM.

## User Stories

| # | Story | Priority |
|---|---|---|
| US1 | As a host, I choose **Public** or **Private** when hosting (both "via KoraLink" and "by yourself" modes) so I control who discovers my match. | P0 |
| US2 | As a player, **every public match shows in my feed regardless of city/location** — distance becomes a sort key + badge, never a hard filter. | P0 |
| US3 | As a host of a **private** match, only people with my **invite link** can open the match (hidden from all feeds; UUID link = the key). Joining via link works normally. | P0 |
| US4 | As a host, once I pick a **pitch**, the format is **locked to the pitch's size** (11v11 pitch → 11v11 match, `max_players` derived) — I cannot pick a mismatched format. | P0 |
| US5 | As a host, once I pick a **pitch**, the picker collapses into a closed summary card (name, size, surface, rate, "Change"). Once I pick a **slot** (via-us mode), date/time/duration collapse into a **locked summary** too. Same pattern in both modes. | P0 |
| US6 | As a player, I see a **notification bell on the feed top-right** with full states: empty / unread badge (count) / notification sheet (grouped, avatars, relative time, tap → deep link) / mark-all-read / per-item unread styling. | P0 |
| US7 | As a recipient, when someone **DMs me, follows me, joins my match, or votes POTM**, a notification lands: badge updates in real time (WebSocket), toast appears if I'm elsewhere in the app, and the Messages tab shows an unread count. | P0 |
| US8 | As a match participant, new **match-chat messages** notify me when I'm not viewing that match (badge + toast), and the match card in Messages shows unread. | P0 |
| US9 | As a player, the feed is **interactive**: pull-to-refresh, live prepend of new activity ("New" pill), unread-since-last-seen divider, richer cards, and empty states that explain *why* (filters vs. truly none). | P1 |
| US10 | As a player with push enabled, DMs/match-chat deliver **web push** when the PWA is closed (graceful no-op without VAPID keys). | P1 |
| US11 | As a host, public matches I create notify my followers (feed item + notification) so discovery works both directions. | P1 |

## Scope & Boundaries

**IN SCOPE**
- DB: `matches.visibility` (`public`\|`private`, default `public`) + migration + backfill; existing matches become public.
- API: visibility-aware feed SQL (`findNearby`, `getMyMatches` unchanged semantics but visibility-respecting); `CreateMatchDto.visibility`; `findOne` access rule (private → host/participant OR holding the link = anyone with UUID); notification fan-out on DM / match-chat / join / follow / POTM / new public match by followee; `GET /users/me/notifications` (exists) + unread count endpoint; WS `notification` push to per-user rooms.
- PWA: Public/Private toggle in host form (both modes); pitch-locked format; collapsible locked summaries; feed bell + notification sheet; BottomNav Messages unread badge; DM/match-chat toasts; interactive feed (pull-to-refresh, live prepend, unread divider, smarter empty states); i18n ar/en for every new string.
- Push: extend `NotificationsService` to send DM/match-chat web push (no-ops without VAPID).

**OUT OF SCOPE (descoped)**
- Notification settings screen (per-type toggles) — next cycle.
- Email/SMS notifications.
- Invite expiry / revocation, invite codes beyond the UUID link.
- Admin tooling for visibility.
- Feed algorithm ranking changes (keep recency + social proximity).

## Success Criteria (verifiable)

1. Create a public match in Jeddah as user A → user B (Riyadh coords) sees it in Play feed, sorted after Riyadh matches, distance badge shown. ✅ verify via headless browser + SQL.
2. Create a private match → it never appears in any feed/search for others; opening `/match/<id>` from the invite link works for a non-member; joining via link works; feed link sharing works (copy/share button on detail).
3. Choose an 11v11 pitch → format control locks to 11v11, `max_players=22`; switching pitch re-locks; publish payload always matches pitch size.
4. Choose slot (via-us) → slot card collapses + date/time/duration render as locked summary with shield icon; self mode → pitch summary collapses, date/time remain editable until published.
5. DM user B from user A (different sessions) → B's bell badge +1 in <1s without page refresh; toast shows if B is on another screen; Messages tab badge +1; sheet lists it as unread; opening the conversation marks read everywhere.
6. Match chat message from A → B (not viewing match) gets badge + toast; viewing match → no toast, live message.
7. Pull-to-refresh on feed works; new activity while page open appears via "New activities" pill without full reload.
8. `turbo run build` zero errors; `vitest` all green (updated suites + new tests for visibility, locking, notification store).

## Open Questions (decide at this gate)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Private link security: plain UUID URL vs. separate invite code? | **Plain UUID link** (36-char unguessable id = the key, industry standard for private calendars/docs). Revocation = flip to public/re-create. Keeps UX one-tap share. |
| Q2 | When user granted location, should feed still *sort* by distance (nearest first) with "All public matches" visible? | **Yes — nearest-first sort + km badge; no exclusion.** Matches US2. |
| Q3 | Should private matches be excluded from "My Games" of participants? | **No — participants see them in My Games** (only discovery feeds hide them). |
| Q4 | Toasts for notifications: auto-dismiss duration / tappable? | Tappable, 4s auto-dismiss, max 1 stacked (Apple HIG feedback patterns). |

## Risks

- **Feed SQL rewrite** (visibility + Riyadh-date + soft-geo in one query) → regression risk on existing 111 tests; mitigated by keeping response shape identical and adding fixtures.
- **WS per-user rooms** need socket auth already in place (it is — token/cookie verified); risk is double-delivery when user has multiple tabs → dedupe by notification id in store.
- **Notification volume** (every match-chat message) → batch/suppress per conversation while user is active in that conversation (in-room check).
- **Web push untested without VAPID keys** → ship behind existing graceful no-op; test path via unit tests only.
- Scope is large (4 surfaces) → vertical slices ordered: visibility → host form → notifications core → feed interactivity.
