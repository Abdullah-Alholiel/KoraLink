# KoraLink Factory Board

> Living kanban maintained by the 5-hour Factory Loop (Hermes cron, profile `koralink`).
> Each lane: **P0** = broken/blocking/money or security · **P1** = missing functionality users feel · **P2** = polish/tech debt.
> Items link their cycle docs in `docs/plans/` and run reports in `kanban/RUNS/`.

**Last updated:** 2026-08-27T04:0xZ (run #3: built P1-6 partner-portal Admin scope + markNoShow 404 fix)
**Last run:** #3 (see `kanban/RUNS/2026-08-27T*.md`)

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
| P1-6 | Admin | **Admin partner-portal scope inconsistency — FIXED**: `updatePitch` now routes through `assertPitchAccess` (Admin bypass, 403 non-owner non-admin, 404 only if missing); `getDashboard`/`getEarnings` accept `actorRole` and scope to ALL venues for Admin via `scopedVenueIds`/`scopedPitchIds`. Controller forwards `user.role`. | partner.service.ts:57-68,149,317,374,463; partner.controller.ts:31,103,120 | **IN-REVIEW** (run #3: d93e1ea; jest 64/64, build 3/3; live: Admin dashboard → 5 venues, Admin PATCH pitch → 200) | docs/plans/partner-portal-admin-scope/ |
| P1-7 | API | **markNoShow 500 for non-roster target — FIXED**: `wasFlagged = player.no_show` was read BEFORE the `if (!player)` guard → `TypeError` 500 instead of `NotFoundException` 404 when a host marks a user not in the roster. Guard reordered before the dereference. | matches.service.ts:1414-1419 | **IN-REVIEW** (run #3: ccfeeb7; jest 64/64; live: non-roster target → 404 NotFound) | docs/plans/partner-portal-admin-scope/ (run #3 slice 2) |

## 🟡 P2 — Polish & tech debt

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P2-1 | Admin | No generic "refund player" tool — refunds only via dispute no-show reversal + host cancelMatch; payouts = manual status flip with synthetic `PO-` reference, no provider. | admin/settlements.service.ts:65-92,99-150 | TODO | — |
| P2-2 | Admin | `dispute_messages` table exists but NO endpoint posts a reply — admin dispute view is read-only. | admin/disputes.service.ts:67-71 | TODO | — |
| P2-3 | Partner | Payout flow not partner-initiated; partner earnings view read-only. | partner.service.ts:374-405 | TODO | — |
| P2-4 | API | Money aggregated via `::float` casts in settlement/user totals — rounding risk in sums. | matches.service.ts:198; admin/users.service.ts:103; admin/settlements.service.ts:36,107 | TODO | — |
| P2-5 | API | Bare mutation responses (contract §2): `castVote` → `{matchId,votedFor,message}` (matches.service.ts:1752), `createDispute` → bare row (:1585/:1606), `createVenue` → partial `{id,name,city}` (partner.service.ts:91), `deletePitch`/`deleteSlot` → `{deleted:true}` (:369/:630), `createSlot` → bare row (:604), wallet topup/pay → `{ledgerEntry, wallet_balance}`. Matches join/leave/start/complete/cancel are compliant ✅. | matches.service.ts:1752,1585,1606; partner.service.ts:91,369,604,630; wallet.controller.ts:61-67 | TODO | — |
| P2-6 | API | WS `leave-conversation` unguarded (no auth/participant check) — inconsistent with its siblings. | app.gateway.ts:333-339 | TODO | — |
| P2-7 | PWA | Offline is read-only cache + banner; no offline mutation queue / background sync (grep `outbox\|BackgroundSync` → 0). | worker/index.js; play/page.tsx:188 | TODO | — |
| P2-8 | API | Push text not localized: `sendPomDecidedNotification` builds its own payload and OMITS locale (notifications.service.ts:192-196); match-start reminder title/body hardcoded English `'⏰ Match starting soon'` + `en-GB` (matches.service.ts:255-260). Deep-link locale plumbing (P1-5) works, but the notification TEXT itself is English-only for Arabic users. | notifications.service.ts:189-196; matches.service.ts:255-260 | TODO | — |
| P2-9 | API | Money/state races: settlement `generatePending` NOT-EXISTS+insert not in a tx and no `unique(venue_id, period_start)` → concurrent runs double-insert; `settlement.pay()` TOCTOU (reads status, updates with no `WHERE status='pending'`) → concurrent pays double-succeed; transactions refund double-submit → unique-violation 500; no-show reversal + dispute-status update not atomic. **Fix plan**: unique-index migration + tx-wrap `generatePending` + conditional `pay`. | admin/settlements.service.ts:65-92,99-150; admin/transactions.service.ts:78-99; admin/disputes.service.ts:87-118 | TODO | — |

---

## Backlog (overflow — minor polish, revisit when P-lanes clear)

- Admin `useLiveAdminData` opens a separate Socket.IO connection per hook instance (dashboard mounts 3 → 3 sockets + 3×30s intervals); should share one socket. `use-live-data.ts:61-86`.
- Admin settings mutations not audit-logged and never capture `adminId`. `settings.service.ts:27-40`.
- `users.service.ts:191` unban emits verb `'account_suspended'` (ternary misuse). Minor.
- `drizzle/seed.ts:8,10` doc drift: header says "8 users" (inserts 15) and stale "reviews" mention. Cosmetic.
- WS gateway `JWT_SECRET` fallback `'fallback-dev-secret'` (app.gateway.ts:109) survives the P0-3 bootstrap hardening — dev-only fallback, but should be flagged/removed for prod parity.
- Zustand persists server cache (`balance`, `paymentMethods`, `bookedMatchIds`, useAppStore.ts:90-99) — server state shouldn't live in the persisted store.
- `GetMatchesDto.format`/`gender` typed `string` not union (get-matches.dto.ts:55,64) — weak DTO enum typing (body DTOs use proper unions).

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
