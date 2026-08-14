# Gate 2 — Architecture

**Cycle:** Match Visibility, Host Form Locking, Interactive Feed, Gate-complete Notifications & Messaging
**Status:** ⏸️ PENDING APPROVAL · Depends on: Gate 1 decisions (Q1–Q4 accepted as recommended)

## Architecture Overview

Two planes: **discovery plane** (who can see a match) and **notification plane** (how users learn about events). Both extend existing choke points — no new top-level services.

```mermaid
flowchart TB
    subgraph PWA["player-pwa"]
        HP[Host page<br/>Public/Private toggle + locked pitch/slot summaries]
        PLAY[Play feed<br/>soft-geo sort + km badge]
        MD[Match detail<br/>invite link share + private access banner]
        FB[Feed page<br/>bell + sheet + pull-to-refresh + live prepend]
        NAV[BottomNav<br/>Messages unread badge]
        TOAST[NotificationToast]
        NPROV[NotificationProvider<br/>WS user room + React Query]
    end
    subgraph API["apps/api"]
        MS[MatchesService<br/>findNearby rewrite + findOne access rule]
        AS[ActivitiesService.record<br/>+ WS emit + unreadCount]
        GW[AppGateway<br/>user rooms + notify helper]
        NS[NotificationsService<br/>generic push + DM/chat push]
        CS[ConversationsService]
    end
    DB[(PostgreSQL<br/>matches.visibility, feed_items)]
    subgraph Out
        WS[WS /lobby → user:&#123;id&#125; rooms]
        PUSH[Web Push]
    end

    HP -->|POST /matches visibility| MS
    MS -->|public only in discovery| PLAY
    MD -->|GET /matches/:id| MS
    MS & CS & FS[FollowsService] & POTM[getPomResult] -->|record()| AS
    AS --> DB
    AS -->|notify(userIds, payload)| GW
    GW --> WS --> NPROV
    NPROV --> NAV & TOAST & FB
    GW -->|afterCommit? no — direct call| NS --> PUSH
```

## Component Changes

### A. Discovery plane — visibility + soft-geo

| File | Change | Why |
|---|---|---1|
| `apps/api/src/database/schema.ts` | Add `visibility: matchVisibilityEnum('visibility').notNull().default('public')` + `matchVisibilityEnum = pgEnum('match_visibility', ['public','private'])`; index `(visibility, status, scheduled_at)` | Query-efficient public feed; default public = backfill by default |
| `drizzle/` migration | `ALTER TABLE matches ADD COLUMN visibility … NOT NULL DEFAULT 'public'` + enum + index | Standard migration; existing rows become public |
| `matches.service.ts → findNearby()` | **Rewrite visibility+geo semantics:**<br>1. `WHERE m.visibility = 'public' OR is-participant/host` (for authed users keep their private matches visible too)<br>2. Geo becomes **soft**: no `ST_DWithin` exclusion — compute `distance_m` when coords present; `ORDER BY` nearest-first when coords present, else `scheduled_at ASC`<br>3. Riyadh tz date filter: `(m.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${date}::date`<br>4. Keep POTM-window clause for participants (unchanged) | Fixes V1 (invisibility), V3 (tz), US2 (public to everyone), US3 (private hidden from feeds) |
| `matches.service.ts → findOne(id, currentUserId?)` | Private match: allow if host, participant, **or any authed user** (UUID link = key, Q1). Private + unauthenticated → 404. Also annotate `is_private: true` in response | US3 invite-link access |
| `CreateMatchDto` | `visibility?: 'public' \| 'private'` (union type, defaults public) | US1 |
| `getMyMatches()` | Add `visibility` to SELECT; no filter change (participants always see their private matches, Q3) | Q3 |
| `NearbyMatchRow` type + `api-adapter.ts` | `is_private?: boolean` passthrough; adapter adds `isPrivate` + `distanceM` already exists — verify | Private badge on cards |
| `play/page.tsx` + `MatchCard` | Show km badge (already?) — ensure distance shown when coords; if `isPrivate` show lock icon + "Private" chip | US2/US3 polish |
| `match/[id]/page.tsx` | For private matches: "Private match — share the invite link" banner + prominent share button | US3 |
| `host/page.tsx` / `HostMatchForm` | New **VisibilityToggle** section (Public default, Globe/Lock icons) both modes; include `visibility` in payload | US1 |

### B. Host form standardisation

| File | Change | Why |
|---|---|---|
| `HostMatchForm.tsx` | 1. **Pitch-locked format**: `useEffect` sync `format = pitch.size` when pitch selected; format picker disabled (grayed, checkmark on pitch size) with "set by pitch" caption; `maxPlayers` always `pitch.size`-derived<br>2. **Collapsed summaries**: once pitch chosen → pitch summary card (name, size · surface · rate, Change); once slot chosen (via-us) → slot summary (date · time · duration locked, shield) — replacing open pickers below venue block<br>3. Payload `format` always from pitch | US4, US5 |
| `MatchDetailsForm.tsx` | New props: `lockedFormat?: Format` (renders locked summary instead of picker), keep `readOnlyDateTime/readOnlyDuration`; format section hidden when locked (summary shows in pitch card) | US4/US5 |
| `PitchSelector.tsx` | When a pitch is selected → collapse to summary row + Change button (instead of keeping full list open) | US5 |
| `SlotPicker` (via-us) | After slot chosen → collapse to locked summary | US5 |
| i18n `ar/en.json` | Keys: visibility, public/private labels+descriptions, lockedByPitch, setByPitch, slotLocked, pitchSummary, changePitch, inviteLink, privateMatchBanner, shareInvite, km away etc. | i18n rule |
| `lib/fetcher` / `useMatches.ts` | `hostMatchSchema` add `visibility: z.enum(['public','private']).default('public')` | Contract alignment §14 |

### C. Notification plane — bell, badge, toasts, WS

| File | Change | Why |
|---   |---|---|
| `activities.service.ts` | `record()` gains: after feed_items insert → `gateway.notifyUsers(recipients, { notification })` + `this.getUnreadCount` cache invalidation n/a (pull) — plus new method `getUnreadNotificationCount(userId)` | Single choke point → all P0 notify flows (DM, follow, join-my-match, POTM) |
| `app.gateway.ts` | 1. On connection: `client.join(\`user:${userId}\`)` always<br>2. New public method `notifyUsers(userIds, payload)` → `server.to(user:...).emit('notification', payload)`<br>3. DM/chat while recipient viewing: suppressed client-side; batch: none (v1 simple) | Real-time badge (US7/US8) |
| `activities.controller.ts` | `GET /users/me/notifications/unread-count` → `{ unreadCount }` | Badge count source |
| `conversations.service.ts → sendMessage` | After insert: fan-out already via `record()` → now emits WS. Also push (web-push) to other participant if not connected (check gateway presence) | US7, US10 |
| `conversations.service.ts` | `markRead` also emits `read` event? (skip v1) | descope |
| `matches.service.ts joinMatch` | Already records activity → auto-notifies host via choke point | US7 |
| `gateway handleDm/handleMessage` | After room broadcast, call `activitiesService.record` for match chat? — No: match chat `new-message` to room + **also fan to participants not in room**: emit `notification` to their user rooms + push | US8 |
| `notifications.service.ts` | Generalise: `sendPushToUsers(userIds, payload)` (query push_subscriptions) + DM/chat title/body builders (i18n-neutral: use actor name + snippet) | US10 |
| **NEW** `components/layout/NotificationBell.tsx` | Bell with states: dot/badge (1–99+), press → bottom sheet (existing sheet pattern z-[60]/[70]); sheet = grouped list rows: actor avatar, i18n sentence, relative time, unread dot; mark-all-read button; per-row tap → deep link (match/messages/profile) | US6 |
| **NEW** `components/layout/NotificationSheet.tsx` | Sheet body: loading skeleton, empty, populated, error states | US6 |
| **New hook** `hooks/useNotificationsFeed.ts` | `useQuery(['notifications'])` → `/users/me/notifications`, `staleTime 30s`, `refetchOnWindowFocus` + WS invalidation; `useUnreadNotificationCount()` | US6 |
| **NEW** `providers/NotificationProvider.tsx` | Mounts WS client to `/lobby` with auth token (single shared socket — reuse pattern from useConversations but hoisted to provider so it lives app-wide, not per-page), joins `user:<id>` room on connect, on `notification` → invalidate `['notifications']` + `['conversations']` + toast + optional vibration | US7/US8, single-socket |
| `store/useAppStore.ts` | Add `notificationBadge: number`, `bumpNotificationBadge(n)`, `bumpMessagesBadge(n)`, `setNotificationBadge(n)` — Zustand slice; bell + BottomNav read it | Badge reactivity |
| `components/layout/BadgedMessageIcon.tsx` (or inline) | BottomNav messages icon with unread badge (sum of conversations unread via `useConversations` in nav? No — use store badge, driven by WS + messages page mount sync) | US8 |
| **NEW** `components/ui/Toast.tsx` + store slice | Tappable toast (4s, single stack): actor avatar + text + tap→deep link; used for notification toasts | Q4 |
| `Feed page` | Bell in header (top-right), pull-to-refresh (touch handler or `useQuery refetch + custom`), "New" pill: refetchOnWindowFocus + WS invalidation → if new items, show pill; unread divider from `feed_items.lastSeen`? — **simpler: localStorage lastSeenFeedAt** | US9 |
| `messages/[id]` page | On mount → `markRead` (already via join-conversation WS) — ensure badge store decrements | US7 |
| `sw.js` | Add push event listener + notificationclick → focus/open deep link | US10 |

### D. Observability (AGENTS.md §4 mandate)

| Slice 3+ | Sentry + Pino + PostHog |
|---|---|
| API: `Logger` in gateway notify, notify fan-out count; Pino HTTP not new. Sentry init check. PostHog capture: `match_created` (visibility), `match_join_via_link`, `notification_delivered`, `notification_opened`, `match_chat_message_sent`, `dm_sent` | Env-gated (pattern in `references/observability-stack-pattern.md`) |

## Data Flow — key sequences

**Private match via invite link (US3):** Host publishes private → API stores `visibility=private` → hidden from feeds (SQL) → host shares `/ar/match/<uuid>` → recipient (authed, non-member) opens → `findOne` allows (UUID = key) → Join button works (visibility ≠ access) → join records activity → host notified.

**DM notification (US7):** A sends DM → `sendMessage` inserts + `record(verb: messaged, recipients:[B])` → feed_items row (B) → gateway `notifyUsers([B])` → B's PWA NotificationProvider receives → badge +1, toast if not on messages, conversations list refetch → B opens conversation → `join-conversation` → markRead → unread 0 (queries refetch).

**Match chat notify (US8):** A in match lobby sends chat → `new-message` to room; gateway also fetches match participants minus connected-to-`match:<id>` users → `notification` to their user rooms + push.

## Files Changed (summary table)

**Backend (8):** schema.ts, drizzle migration (new), matches.service.ts, matches.controller.ts (findOne pass user), create-match.dto.ts, activities.service.ts, activities.controller.ts, app.gateway.ts, conversations.service.ts, notifications.service.ts, app.module.ts (if provider wiring)

**Frontend (14):** host/page.tsx? (no — HostMatchForm), HostMatchForm, MatchDetailsForm, PitchSelector, SlotPicker, play/page.tsx, MatchCard, match/[id]/page.tsx, (main)/page.tsx (feed), BottomNav, NotificationBell (new), NotificationSheet (new), NotificationProvider (new), useNotificationsFeed (new), useMatches.ts (schema), store/useAppStore.ts, ui/Toast (new), sw.js, messages/[id]/page.tsx, i18n ar/en.json

## i18n keys (both languages)

`host.visibility`, `host.visibilityPublic`, `host.visibilityPrivate`, `host.visibilityPublicDesc`, `host.visibilityPrivateDesc`, `host.lockedByPitch`, `host.setByPitch`, `host.pitchSummary`?, `host.changePitch`, `host.slotSummary`, `notifications.title`, `notifications.empty`, `notifications.emptyDescription`, `notifications.markAllRead`, `notifications.unread`, `notifications.joinedYourMatch`, `notifications.followedYou`, `notifications.messagedYou`, `notifications.pomDecided`, `notifications.newMatchByFollowee`, `notifications.seeAll`, `feed.newActivities`, `feed.markAllRead`, `feed.pullToRefresh`, `feed.private`, `feed.privateMatch`, `match.privateBanner`, `match.inviteLink`, `match.copyLink`, `match.linkCopied`, `match.kmAway`, `match.youAreIn`, `nav.badge` etc.

## Risks & Mitigations

1. **Feed SQL rewrite regression** → response shape unchanged (`NearbyMatchRow[]`); add vitest fixtures for soft-geo + private exclusion + tz; run full suite.
2. **WS double-delivery (multi-tab)** → dedupe by notification id in provider store; idempotent badge set (absolute from server, not incremental).
3. **Activity fan-out to followers (US11)** needs `new_match` verb — add `activityVerbEnum` value via migration; fan-out recipients = host's followers (cap 500, descope beyond).
- wait, US11 needs enum extension; if the enum extension is risky mid-cycle, descope US11 to next cycle. **Decision: implement US11 via enum extension `created_match` reuse** — `created_match` verb already exists! Fan-out on public match creation to followers. No enum change needed. (verify: `record()` in createMatch currently records to whom? matches.service.ts:451 — check recipients.) Recipients for create currently unclear → wire followers there for public matches.
4. **Private match leaking via activity feed** → `record()` for private matches must fan-out ONLY to participants (join) or none (create). Guard in matches.service call sites.
5. **Performance: sort all public matches by distance** → GiST index on location exists? `matches` has none — add GiST index in migration for `ST_Distance` sort perf; LIMIT 50 unchanged.
6. **`findOne` private + unauthenticated** → currently JWT guard blocks unauthenticated anyway (all match endpoints guarded) → unauthed users can never open invite links without login. Acceptable (link → login → match). Banner on match page if not member.
7. **Push without VAPID** → `sendPushToUsers` no-ops when unconfigured (existing pattern).
8. **Sw change** → bump cache name; reinstall prompt for testers.

## Descoped (this cycle)

- Per-type notification settings screen
- `read` receipts events; typing indicators
- Invite link expiry/revocation; separate invite codes
- Feed ranking changes; US11 push (WS+feed only)
- Presence ("online now") indicators

## Open items for Gate 3

- Exact JSON shapes for: notifications list, unread-count, WS `notification` payload, `POST /matches` with visibility, `findNearby` rows incl. `is_private`
- Zod↔DTO alignment table
- i18n full key list ar+en
- Toast component API + store API
- `markAllRead` optimistic update flow
