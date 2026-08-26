# KoraLink Factory Board

> Living kanban maintained by the 5-hour Factory Loop (Hermes cron, profile `koralink`).
> Each lane: **P0** = broken/blocking/money or security · **P1** = missing functionality users feel · **P2** = polish/tech debt.
> Items link their cycle docs in `docs/plans/` and run reports in `kanban/RUNS/`.

**Last updated:** 2026-08-26T17:00Z (run #1 — bootstrap review)
**Last run:** #1 (see `kanban/RUNS/2026-08-26T16-31-54Z.md`)

---

## 🔴 P0 — Critical (broken / blocking)

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P0-1 | API | **Private-match data leak**: `GET /matches/:id`, `GET /matches/:id/messages`, `GET /matches/:id/calendar` serve PRIVATE matches (details, players, location, full chat history) to ANY authenticated user — no visibility/membership check. Feed correctly filters `visibility='public'` (matches.service.ts:269) and WS `join-lobby`/`sendMessage` enforce membership, so only these REST reads leak. | matches.controller.ts:108-112,149-153,57-66 → matches.service.ts:322 (`findOne(matchId)` no viewer), :781 (`getMessages(matchId)` no userId) | WIP (run #1) | `docs/plans/private-match-access-control/` |
| P0-2 | API/Wallet | **Fake self-credit top-up**: `POST /wallet/topup` credits the caller's wallet with no payment provider behind it (grep `moyasar\|stripe\|tap\|hyperpay` in apps/api/src → 0 hits); PWA wallet page calls it directly up to SAR 10,000. | wallet.controller.ts:53-68; wallet/page.tsx:87-103; topup-wallet.dto.ts:23 | BLOCKED — needs Abdullah's decision on payment provider (Moyasar/HyperPay/Tap) + credentials. Interim option: gate endpoint behind NODE_ENV like dev-login. | — |

## 🟠 P1 — High-value missing functionality

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P1-1 | API | **No scheduler/cron anywhere** (grep `@nestjs/schedule\|cron\|setInterval` → 0): web-push send path exists but match reminders never fire; POTM 24h window never finalized by a job (lazy compute only on `GET /matches/:id/pom-result`); past-match auto-complete only runs at module init (restarts only). | notifications.service.ts:125-166; matches.service.ts:131,1649 | TODO | — |
| P1-2 | API | **Discovery filters incomplete**: no `skill_level` filter in GetMatchesDto; `radius_km` destructured but UNUSED — distance is a soft sort, never a hard radius cutoff. | get-matches.dto.ts; matches.service.ts:163,176-184 | TODO | — |
| P1-3 | API/Chat | **Chat pagination + media + idempotency race**: history hard-capped `limit: 50` asc, no cursor; `match_messages.content` text-only (no attachment table); `client_message_id` dedup is findFirst→insert with NO unique index (concurrent retry duplicates). | matches.service.ts:781-799,834-863; schema.ts:390 | TODO | — |
| P1-4 | DB | **Missing hot-FK indexes** (matches has only status+scheduled_at): `matches.host_id`, `matches.pitch_id`, `activities.actor_id`, `disputes.reporter_id`, `reports.reporter_id`, `venues.owner_id`, `transactions.reference_id`, and `match_messages(match_id, created_at)` for chat history. | schema.ts:336-339 | TODO | — |
| P1-5 | PWA | **SW push deep-link hardcodes `locale='en'`** — Arabic users (primary market) tapping a push notification land on the English page. | apps/player-pwa/worker/index.js:19 | TODO | — |

## 🟡 P2 — Polish & tech debt

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| P2-1 | Admin | No generic "refund player" tool — refunds only via dispute no-show reversal + host cancelMatch; payouts = manual status flip with synthetic `PO-` reference, no provider. | admin/settlements.service.ts:65-92,99-150 | TODO | — |
| P2-2 | Admin | `dispute_messages` table exists but NO endpoint posts a reply — admin dispute view is read-only. | admin/disputes.service.ts:67-71 | TODO | — |
| P2-3 | Partner | Payout flow not partner-initiated; partner earnings view read-only. | partner.service.ts:374-405 | TODO | — |
| P2-4 | API | Money aggregated via `::float` casts in settlement/user totals — rounding risk in sums. | matches.service.ts:198; admin/users.service.ts:103; admin/settlements.service.ts:36,107 | TODO | — |
| P2-5 | API | Bare mutation responses (contract §2): `castVote` → `{message}`, `createDispute` → bare row, wallet topup/pay → `{ledgerEntry, wallet_balance}`. Matches join/leave/start/complete/cancel are compliant ✅. | matches.service.ts:1504,1358; wallet.controller.ts:61-67 | TODO | — |
| P2-6 | API | WS `leave-conversation` unguarded (no auth/participant check) — inconsistent with its siblings. | app.gateway.ts:333-339 | TODO | — |
| P2-7 | PWA | Offline is read-only cache + banner; no offline mutation queue / background sync (grep `outbox\|BackgroundSync` → 0). | worker/index.js; play/page.tsx:188 | TODO | — |

---

## Verified-OK (reviewer + run #1 spot-check — do not re-litigate without new evidence)

- i18n parity perfect: ar.json = en.json, 630/630 leaf keys, 0 diff.
- Wallet page renders all 5 UX states (wallet/page.tsx:76-83,148,235,350); feed has offline edge state.
- Wallet ledger idempotency correct (in-tx check + unique key, wallet.service.ts:49-88); slot booking uses `FOR UPDATE` ✅.
- Matches join/leave/start/complete/cancel return populated `findOne` outside tx ✅.
- `sendMessage` (REST + WS) enforces membership ✅; WS `join-lobby`/`join-conversation` enforce membership/participant ✅.
- dev-login gated by NODE_ENV ✅. No console.log/mock data in prod paths ✅.
- Services healthy at run #1: api/pwa/admin all active, API /health OK, 0 journal errors in 5h window.

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
