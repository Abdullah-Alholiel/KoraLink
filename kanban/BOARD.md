# KoraLink Factory Board

> Living kanban maintained by the 5-hour Factory Loop (Hermes cron, profile `koralink`).
> Each lane: **P0** = broken/blocking/money or security · **P1** = missing functionality users feel · **P2** = polish/tech debt.
> Items link their cycle docs in `docs/plans/` and run reports in `kanban/RUNS/`.

**Last updated:** _(bootstrap — run #1 will fill this board)_
**Last run:** —

---

## 🔴 P0 — Critical (broken / blocking)

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| — | — | _run #1 bootstraps this table_ | — | — | — |

## 🟠 P1 — High-value missing functionality

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| — | — | _run #1 bootstraps this table_ | — | — | — |

## 🟡 P2 — Polish & tech debt

| # | Area | Item | Evidence | Status | Cycle |
|---|------|------|----------|--------|-------|
| — | — | _run #1 bootstraps this table_ | — | — | — |

---

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
