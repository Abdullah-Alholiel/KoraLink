# KoraLink Factory Board

> Living kanban maintained by the 5-hour Factory Loop (Hermes cron, profile `koralink`).
> Each lane: **P0** = broken/blocking/money or security · **P1** = missing functionality users feel · **P2** = polish/tech debt.
> Items link their cycle docs in `docs/plans/` and run reports in `kanban/RUNS/`.

**Last updated:** 2026-08-28T06:59Z (run #8: createDispute idempotency + migration-tracking reconcile)
**Last run:** #8 (see `kanban/RUNS/2026-08-28T06-59Z.md`)

---

## 🔴 P0 — Critical (broken / blocking)

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P0-1 | API | **REST chat reads leaked every match conversation** — `messages` relation in GET /matches/:id + GET /:id/messages had no membership check while WS already enforced it. FIXED by run #1, VERIFIED live by parent session (2026-08-26T18:1xZ). | matches.controller.ts:108-112,149-153; matches.service.ts:322,781 | **DONE ✅** (run #1: 19041aa, 005dec0, 4b87a9f; live: member 200/2 msgs, outsider 403, outsider detail messages stripped to 0, roster intact; jest 30/30) | docs/plans/private-match-access-control/ |
| P0-2 | API/Wallet | **Fake self-credit top-up**: `POST /wallet/topup` credits the caller's wallet with no payment provider behind it (grep `moyasar\|stripe\|tap\|hyperpay` in apps/api/src → 0 hits); PWA wallet page calls it directly up to SAR 10,000. **Interim MITIGATION LANDED (Abdullah: "keep dummy for now")**: endpoint now 403s when `NODE_ENV=production` (mirrors dev-login gating); dummy path intact in dev/test (live-verified: 201 + credit). **⚠️ run #2 finding**: the live box runs `NODE_ENV=development` (systemd loads `apps/api/.env`), so this prod-gate is NOT exercised on the current Tailscale deployment — dev-login AND dummy top-up are both live for any tailnet peer. Acceptable for a private dev box; MUST set `NODE_ENV=production` (+ real secrets, remove dev-login) before public launch. | wallet.controller.ts:53-68; wallet/page.tsx:87-103; topup-wallet.dto.ts:23; systemd koralink-api.service EnvironmentFile | WIP — dummy kept in dev; **real payment provider still needed** (Moyasar/HyperPay/Tap) | docs/plans/wallet-topup-dummy-gate/ |
| P0-3 | API/Security | **Placeholder auth secrets in live deployment** — `JWT_SECRET=change-me` + `COOKIE_SECRET=change-me` loaded into the running systemd process → any tailnet peer could forge an Admin/user JWT or signed cookie (HS256 key publicly known). **FIXED by run #2 (42d2d86)**: new `assertBootstrapSecrets()` guard in `main.ts` hard-fails boot on placeholder/missing secrets (any env) and <32-char secrets (prod); live `.env` regenerated with `openssl rand -hex 32`; `.env.example` now ships empty secrets + generation guidance. Verified: guard throws on `change-me` (compiled-dist proof), API boots clean with real secrets, health 200. | main.ts:23-30; common/security/bootstrap-secrets.ts; /proc/<pid>/environ | **DONE ✅** (run #2: 42d2d86; jest 52/52, build 3/3, live restart + health 200) | docs/plans/env-secret-hardening/ |

## 🟠 P1 — High-value missing functionality

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P1-1 | API | **No scheduler/cron anywhere — FIXED + LIVE-VERIFIED**: `@nestjs/schedule` added — (1) `*/5m` auto-complete past matches (closes the restart gap permanently), (2) `*/5m` POTM finalize (announces winners when the 24h window closes; no-vote/tie stamped so no re-scan), (3) `*/15m` "match starting soon" reminders to confirmed players (once per match via `reminders_sent_at`, migration 0017). **Live-proof**: cron tick announced 2 POTM winners (18:40Z) + stamped no-vote matches; run #2 re-verified: 3 @Cron jobs in code, `reminders_sent_at` col live, `pom_winner_id` set on 4 matches, live log line "finalized 2 match(es)". | matches.scheduler.ts; matches.service.ts:131,145-300; schema.ts | **DONE ✅** (run #2 re-verified 2026-08-26T22:2xZ) | docs/plans/scheduler/ |
| P1-2 | API | **Discovery filters incomplete**: no `skill_level` filter in GetMatchesDto; `radius_km` destructured but UNUSED — distance is a soft sort, never a hard radius cutoff. | get-matches.dto.ts; matches.service.ts:163,176-184 | TODO | — |
| P1-3 | API/Chat | **Chat idempotency + pagination indexes — idempotency DONE + VERIFIED**: `client_message_id` dedup backed by unique index `match_messages_client_msg_uidx` (partial, WHERE NOT NULL) + keyset index `match_messages_match_created_idx` (migration 0014); REST + WS both `onConflictDoNothing` + winner re-read (commits 6351726, 65bac93). **Remaining**: history hard-capped `limit: 50` asc no cursor pagination; `match_messages.content` text-only (no attachment table). | matches.service.ts:781-799,834-863; schema.ts:390 | WIP (idempotency DONE; pagination + media TODO) | docs/plans/ (run #1 report) |
| P1-4 | DB | **Missing hot-FK indexes — DONE + APPLIED**: `matches.host_id`/`pitch_id`, `activities.actor_id`, `disputes.reporter_id`, `reports.reporter_id`, `venues.owner_id`, `transactions.reference_id` — all 7 indexes via migration `0015_bored_wraith` (drizzle-kit generated, applied to live DB). **run #2 re-verified live: 7/7 in pg_indexes.** | schema.ts:336-339; drizzle/0015 | **DONE ✅** (run #2 re-verified 2026-08-26T22:2xZ) | docs/plans/hot-fk-indexes/ |
| P1-5 | PWA | **SW push deep-link hardcodes `locale='en'` — FIXED + VERIFIED**: SW reads `data.locale` (fallback en); API stores per-subscription locale (`push_subscriptions.locale`, migration 0016) captured at subscribe time; `sendPushToUsers` injects the subscriber's locale. **run #2 re-verified: `locale` col live (varchar)**. ⚠️ caveat: `sendPomDecidedNotification` (notifications.service.ts:192-196) builds its own payload and OMITS locale → POTM pushes always deep-link `en`. Tracked as P2-8. | apps/player-pwa/worker/index.js:19; notifications.service.ts:125-166,192-196 | **DONE ✅** (run #2 re-verified; POTM-locale caveat → P2-8) | docs/plans/ (P1-5 slice) |
| P1-6 | Admin | **Admin partner-portal scope inconsistency — FIXED + VERIFIED**: `updatePitch` routes through `assertPitchAccess` (Admin bypass, 403 non-owner non-admin, 404 only if missing); `getDashboard`/`getEarnings` accept `actorRole` and scope to ALL venues for Admin via `scopedVenueIds`/`scopedPitchIds`. Controller forwards `user.role`. | partner.service.ts:57-68,149,317,374,463; partner.controller.ts:31,103,120 | **DONE ✅** (run #3: d93e1ea; run #4 re-verified: jest 71/71, build 3/3) | docs/plans/partner-portal-admin-scope/ |
| P1-7 | API | **markNoShow 500 for non-roster target — FIXED + VERIFIED**: `wasFlagged = player.no_show` was read BEFORE the `if (!player)` guard → `TypeError` 500 instead of `NotFoundException` 404 when a host marks a user not in the roster. Guard reordered. | matches.service.ts:1414-1419 | **DONE ✅** (run #3: ccfeeb7; run #4 re-verified: guard precedes deref) | docs/plans/partner-portal-admin-scope/ (run #3 slice 2) |
| P1-8 | API/Wallet | **`joinMatch` never debits the joiner's `price_per_player`** — joiners join paid matches free; only the host is charged pitch cost (koralink mode). **Blocked on P0-2** (no real payment provider — wallet is dummy self-credit). Correct once real payments land. | matches.service.ts:603-716,879-894 | BLOCKED (P0-2) | — |
| P1-9 | PWA/Realtime | **POTM realtime socket dialed the wrong namespace — FIXED (run #5, 58b3ba3)**: `PostMatchSection` used a raw `io()` with the pathful `NEXT_PUBLIC_API_URL` base → namespace `/api/v1/lobby` → gateway rejects the handshake ("Invalid namespace") → the `pom-decided` winner toast silently never fired for users viewing the match-detail page. All 5 other realtime call sites already used `createLobbySocket()`. Now routes through the shared helper (origin `/lobby`) + regression test. Live probe: `/lobby` → CONNECTED, `/api/v1/lobby` → Invalid namespace. | PostMatchSection.tsx:45 | **DONE ✅** (run #6 verified: reviewer CONFIRMED + regression test present; build 3/3, vitest 218/218). Note: commit msg said "6 call sites" — actual is 5 (overcount, substance correct). | docs/plans/run5-pom-realtime-namespace/ |
| P1-10 | API/Security | **WS handshake skipped ban/suspend + role-staleness — FIXED (run #6, 4df0d4d)**: `handleConnection` verified only the JWT signature, so a banned/suspended user kept full chat/DM/lobby access over the socket until token expiry (≤7d) while REST 401'd immediately (`jwt-cookie.strategy.ts:71-76`). Also the `ops` room join used the stale token `role`, so a demoted admin retained live console pings. Now re-reads the user row (id/role/banned_at/suspended_until) on every handshake, mirrors the strategy, disconnects banned/future-suspended/missing accounts with a Pino warn, and joins `ops` by DB role. +7 jest cases. | app.gateway.ts:108-154 (was 108-123); jwt-cookie.strategy.ts:48-83 | **DONE ✅** (run #7 verified: handleConnection re-reads the user row and disconnects banned/future-suspended/missing accounts; joins `ops` by DB role; spec 7 cases; build 3/3, jest 83/83, vitest 218/218) | docs/plans/run6-ws-moderation-enforcement/ |
| P1-11 | API/Chat | **DM send idempotency is SELECT-then-INSERT (TOCTOU), no unique index** — `personal_messages` had only `conv_idx`/`conv_created_idx` (schema.ts:651-652); no partial unique on `(sender_id, conversation_id, client_message_id)`. `sendMessage` did findFirst→insert (`conversations.service.ts:210-241`), so concurrent retried DMs could duplicate. | conversations.service.ts:210-241; schema.ts:632-652 | **DONE ✅** (run #7 built dfc671f; run #8 verified: `onConflictDoNothing`+winner re-read+side-effect skip confirmed in code, live `personal_messages_client_msg_uidx` in pg_indexes, reviewer CONFIRMED; build 3/3, jest 87/87, vitest 218/218) | docs/plans/run7-dm-idempotency/ |
| P1-12 | Admin | **Admin/partner console is English-only** — `apps/admin` has no i18n; Arabic-first venue owners cannot operate the partner portal in their language. | apps/admin (no i18n layer) | TODO | — |
| P1-13 | API | **No match reschedule/edit-after-create** — hosts can cancel but cannot move time/venue; forces cancel+recreate (loses roster/payments). | matches.service.ts (no update-scheduled route) | TODO | — |
| P1-14 | API/Wallet | **Settlement payout never executes** — settlements track `pending/paid` but no actual bank payout; IBAN collected at verification but unused. Venue owners never receive earnings. | admin/settlements.service.ts:99-150 | BLOCKED (P0-2 — needs real payment/payout provider) | — |
| P1-15 | API | **createDispute TOCTOU duplicate race — FIXED (run #8, 8fa95f9)**: `createDispute` deduped with a non-atomic select-then-insert (`matches.service.ts:1559-1607`) and no unique index on `(match_id, reporter_id, type)`, so a concurrent double-tap opened two identical disputes. Now `disputes_open_uidx` (partial, WHERE status IN ('opened','under_review')) + `onConflictDoNothing` + winner re-read attaches the appeal as evidence. Migration 0020. | matches.service.ts:1559-1607; schema.ts:731-770 | **IN-REVIEW** (run #8: 8fa95f9; index live in pg_indexes; jest 87/87, build 3/3, vitest 218/218) | docs/plans/run8-dispute-idempotency/ |
| P1-16 | PWA/API | **No padel support — product is football-only** despite "padel/football" framing: `pitchSizeEnum = ['5v5','7v7','8v8','11v11']` (schema.ts:47-52), `surfaceTypeEnum = ['Grass','Artificial']` (:54), no `sport_type` column, zero "padel"/"2v2"/"doubles" strings in en.json/ar.json. Whole-sport gap if padel is in scope (2v2 size, glass/padel surface, doubles format). | schema.ts:47-54; en.json/ar.json | TODO (needs Abdullah scope decision) | — |
| P1-17 | PWA/API | **No waitlist/overflow for full matches** — 0 hits for "waitlist" across apps/; a Full match gives players no queue path (churn point for popular padel/football slots). | apps/ (grep waitlist → 0) | TODO | — |

## 🟡 P2 — Polish & tech debt

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P2-1 | Admin | No generic "refund player" tool — refunds only via dispute no-show reversal + host cancelMatch; payouts = manual status flip with synthetic `PO-` reference, no provider. | admin/settlements.service.ts:65-92,99-150 | TODO | — |
| P2-2 | Admin | `dispute_messages` table exists but NO endpoint posts a reply — admin dispute view is read-only. | admin/disputes.service.ts:67-71 | TODO | — |
| P2-3 | Partner | Payout flow not partner-initiated; partner earnings view read-only. | partner.service.ts:374-405 | TODO | — |
| P2-4 | API | Money aggregated via `::float` casts in settlement/user totals — rounding risk in sums. **run #5 reviewer added**: `settlements.service.ts:115` `COALESCE(SUM(pitch_cost_sar),0)::float` feeds `amount.toFixed(2)` (float precision risk on large payout sums). | matches.service.ts:198; admin/users.service.ts:103; admin/settlements.service.ts:36,107,115 | TODO | — |
| P2-5 | API | Bare mutation responses (contract §2): `castVote` → `{matchId,votedFor,message}` (matches.service.ts:1752), `createDispute` → bare row (:1585/:1606), `createVenue` → partial `{id,name,city}` (partner.service.ts:91), `deletePitch`/`deleteSlot` → `{deleted:true}` (:369/:630), `createSlot` → bare row (:604), wallet topup/pay → `{ledgerEntry, wallet_balance}`. Matches join/leave/start/complete/cancel are compliant ✅. | matches.service.ts:1752,1585,1606; partner.service.ts:91,369,604,630; wallet.controller.ts:61-67 | TODO | — |
| P2-6 | API | WS `leave-conversation` unguarded (no auth/participant check) — inconsistent with its siblings. | app.gateway.ts:333-339 | TODO | — |
| P2-7 | PWA | Offline is read-only cache + banner; no offline mutation queue / background sync (grep `outbox\|BackgroundSync` → 0). | worker/index.js; play/page.tsx:188 | TODO | — |
| P2-8 | API | Push text not localized: `sendPomDecidedNotification` builds its own payload and OMITS locale (notifications.service.ts:192-196); match-start reminder title/body hardcoded English `'⏰ Match starting soon'` + `en-GB` (matches.service.ts:255-260). Deep-link locale plumbing (P1-5) works, but the notification TEXT itself is English-only for Arabic users. | notifications.service.ts:189-196; matches.service.ts:255-260 | TODO | — |
| P2-9 | API | **Money/state races — FIXED (run #4, 3377567)**: settlement `generatePending` NOT-EXISTS+insert not in tx, no `unique(venue_id, period_start)` → concurrent double-insert; `settlement.pay()` TOCTOU (no `WHERE status='pending'`) → concurrent double-pay; `reports.create` select-then-insert dedup, no unique index → duplicate reports. **Fixed**: unique indexes (`settlements_venue_period_uidx`, partial `reports_open_subject_uidx`), tx-wrap + `onConflictDoNothing` for generatePending, conditional UPDATE for pay. Migration 0018. | admin/settlements.service.ts:65-150; reports.service.ts:19-56; schema.ts:812-892 | **DONE ✅** (run #4: 3377567; jest 71/71; live: generate→201, report dup→400, both indexes in pg_indexes) | docs/plans/run4-data-integrity-races/ |
| P2-10 | API/Wallet | **recordTransaction idempotency replay returns 409**, not the original entry — a webhook retry gets `ConflictException` instead of the original result. | wallet.service.ts:56-58 | TODO | — |
| P2-11 | API/Auth | **verify-otp returns JWT in response body when NODE_ENV ≠ production** — dev-only token leakage. | auth.controller.ts:86 | TODO | — |
| P2-12 | API/Admin | **Admin scope `sql\`true\`` inconsistent** — `scopedVenueIds`/`scopedPitchIds`/`getDashboard` use it but `getVenues`/`getPitches` inline the ternary. | partner.service.ts:45,55,155,279 | TODO | — |
| P2-13 | PWA | **Dead UI MapPin** in clubs header — no onClick/href. | clubs/page.tsx:64 | TODO | — |
| P2-14 | API/Moderation | **Unban wrong verb — FIXED (run #4, 3377567)**: `verb: updates.banned_at ? 'account_banned' : 'account_suspended'` fired `account_suspended` on unban → a reinstated user told they were suspended. Now emits `account_unbanned` (enum + type + PWA feed/bell/toast + ar/en i18n). | users.service.ts:188-194; activities.service.ts:18-31; ActivityCard.tsx; NotificationSheet.tsx; NotificationProvider.tsx | **DONE ✅** (run #4: 3377567; build 3/3, jest 71/71, vitest 217/217) | docs/plans/run4-data-integrity-races/ |
| P2-15 | PWA/Wallet | **Wallet history queryKey omits page/perPage** — `useWalletHistory` `queryKey: ['wallet','history']` (useWallet.ts:29-38) → history silently capped at API default (20 rows); pagination params never invalidate the cache. | useWallet.ts:29-38 | TODO | — |
| P2-16 | Observability | **`console.error` instead of Sentry `captureError`** — `usePushNotifications.ts:74,92` and `ErrorBoundary.tsx:30` log to console, bypassing the AGENTS.md §4 Sentry standard. | usePushNotifications.ts:74,92; ErrorBoundary.tsx:30 | TODO | — |
| P2-17 | PWA/Auth | **AuthBootstrap skips `/users/me` when a persisted `user` exists** — `enabled: isHydrated && !user` (AuthBootstrap.tsx:72) means an expired-cookie return visit (persisted `user` + `isAuthenticated`, dead cookie) never revalidates → stale authed shell while every fetch 401s. `fetcher` throws `FetchError` with no 401→logout interceptor (fetcher.ts:80-106). Edge case, self-heals on explicit logout/login. | AuthBootstrap.tsx:72; fetcher.ts:80-106 | TODO | — |
| P2-18 | API | **No recurring/standing player matches** — only venue-level weekly slot generation (partner.service.ts:511, SlotManager.tsx:145); players can't set up a repeating booking. | partner.service.ts:511; SlotManager.tsx:145 | TODO | — |

---

## Backlog (overflow — minor polish, revisit when P-lanes clear)

- Admin `useLiveAdminData` opens a separate Socket.IO connection per hook instance (dashboard mounts 3 → 3 sockets + 3×30s intervals); should share one socket. `use-live-data.ts:61-86`.
- Admin settings mutations not audit-logged and never capture `adminId`. `settings.service.ts:27-40`.
- `users.service.ts:191` unban emits verb `'account_suspended'` (ternary misuse). Minor.
- `drizzle/seed.ts:8,10` doc drift: header says "8 users" (inserts 15) and stale "reviews" mention. Cosmetic.
- WS gateway `JWT_SECRET` fallback `'fallback-dev-secret'` (app.gateway.ts:109) survives the P0-3 bootstrap hardening — dev-only fallback, but should be flagged/removed for prod parity.
- Zustand persists server cache (`balance`, `paymentMethods`, `bookedMatchIds`, useAppStore.ts:90-99) — server state shouldn't live in the persisted store.
- `GetMatchesDto.format`/`gender` typed `string` not union (get-matches.dto.ts:55,64) — weak DTO enum typing (body DTOs use proper unions).
- Notifications subscribe/unsubscribe accept a raw `SubscribeBody` interface, no class-validator DTO (notifications.controller.ts:21-28). Minor parity gap.
- Dead `rating` column persists after the reviews removal (schema.ts:187,222) — dropped in code, not in schema. Minor.
- `POST /wallet/pay` reuses `TopupWalletDto` (wallet.controller.ts:93) — should have its own DTO. Minor.
- Play search bar is decorative dead UI — `<span>"Where to play?"</span>` in `TopAppBar.tsx:31`, no input/handler (run #6 reviewer).
- No per-category notification preferences — only a global push toggle in profile (run #6 reviewer).
- CSP `script-src` includes `'unsafe-eval' 'unsafe-inline'` (`next.config.mjs:171`) — weakens CSP; narrow via nonces later (run #6 reviewer).
- `personal_messages` DM idempotency TOCTOU — tracked as P1-11 (run #6 reviewer). **BUILT run #7 (dfc671f).**
- API/PWA systemd units (`koralink-api.service`, `koralink-pwa.service`) not committed to repo — only `apps/admin/deploy/koralink-admin.service` is. Commit for reproducible deploys (run #7 reviewer).
- `mark-no-show.dto.ts:6` uses `@IsUUID()` while every other ID DTO uses varchar(36)/`@IsString` — rejects non-UUID-format IDs (run #7 reviewer).
- `castVote` upsert resets `created_at` on a vote change (matches.service.ts:1750) — minor (run #7 reviewer).
- `seed.ts` still seeds `rating` (seed.ts:65,76,87,239) after the reviews removal — dead column (run #7 reviewer).
- **Migration files 0002/0008 were edited in-place after apply**; tracking reconciled manually run #8 (`drizzle.__drizzle_migrations` now 22 rows, `db:migrate` re-verified working). Do NOT edit applied migration .sql files — generate a new migration instead (run #8).
- `TopAppBar.tsx` is wholly orphaned dead code (imported nowhere) with no-op bell/`+`/search (run #8 reviewer).
- `reports.service.ts:64` create() returns bare report row; `settlements.service.ts:155` generatePending returns bare array — bare-return contract (P2-5 class), low impact (run #8 reviewer).

---

## Verified-OK (reviewer + run #1/#2 spot-check — do not re-litigate without new evidence)

- i18n parity perfect: ar.json = en.json, 630/630 leaf keys, 0 diff.
- Wallet page renders all 5 UX states (wallet/page.tsx:76-83,148,235,350); feed has offline edge state.
- Wallet ledger idempotency correct (in-tx check + unique key, wallet.service.ts:49-88); slot booking uses `FOR UPDATE` ✅.
- Matches join/leave/start/complete/cancel return populated `findOne` outside tx ✅.
- `sendMessage` (REST + WS) enforces membership ✅; WS `join-lobby`/`join-conversation` enforce membership/participant ✅.
- Admin RBAC correctly enforced at the API boundary: all 9 `admin/*` controllers carry `AdminAuthGuard`; `partner/*` uses `Roles('VenueOwner','Admin')` + per-service ownership checks; self-ban + last-admin guards present. Client `rbac.ts` is single source of truth; layout guard redirects Players/no-role.
- No console.log/mock data in prod paths ✅.
- dev-login gated by NODE_ENV ✅ (code-correct; note P0-2 caveat that the live box runs NODE_ENV=development).
- Services healthy: api/pwa/admin all active, API /health 200, 0 journal errors in 5h window.

## Areas in scope (every run must assess all four)

- **PWA** (`apps/player-pwa`) — player experience, i18n, offline, realtime UX, 5 UX states
- **Admin console** (`apps/admin`) — HQ dashboard + partner portal, RBAC, moderation queues
- **API** (`apps/api`) — NestJS endpoints, contracts, realtime gateways, auth
- **DB / Infra** — Drizzle schema, migrations, indexes, deployment services, observability

## Status legend

- `TODO` — queued, not started
- `WIP` — a run is actively building it (see latest RUNS report)
- `IN-REVIEW` — built, awaiting next run's verification pass
- `DONE ✅` — verified by a subsequent run (build + tests + spot-check)
- `BLOCKED` — cannot proceed; blocker noted in `kanban/RUNS/` and STATE.json

## Rules

1. A run may only mark an item `DONE` **after** `turbo run build` + `npx vitest run` are green for its slices.
2. The **next** run re-verifies previous `IN-REVIEW` items before trusting them (claims ≠ facts).
3. New findings always cite evidence (file:line, endpoint, failing flow) — no vibes-based items.
