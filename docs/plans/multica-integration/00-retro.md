# Gate 0 — Retrospective: Why the Kanban Board Isn't Used (2026-08-31)

## Context

Abdullah: *"I feel like the kanban board is something I don't touch or easily see from the webui kanban view… I want to open this board and view and interact with it."*

## What exists today

- **Hermes kanban board `koralink-factory-loop`** = live UI mirror of the repo SoT `kanban/BOARD.md` (convention: parent gate card `t_ce9a513a`, mirror cards gated under it, NEVER completed; `kanban/BOARD.md` is the authoritative DONE record).
- **Access surface today:** `hermes dashboard` on `100.93.99.24:9119` (Tailscale; `--isolated --host 100.93.99.24 --no-open`, pid 1455) → "Kanban" tab. CLI equivalent: `hermes kanban --board koralink-factory-loop …`.
- Board content (verified 2026-08-31): **73 todo + 2 blocked** mirror cards, all `assignee=koralink`, gated under `t_ce9a513a` (blocked 85h per its diagnostics). 6 boards total in the kanban store (`/home/ubuntu/.hermes/kanban/boards/<slug>/kanban.db`).
- Loop (cron `03ed02bc8d04`, 15 1,10,15,20 UTC) writes mirror cards + run comments each cycle. Nothing consumes the board for *human* decisions today.

## Why Abdullah doesn't touch it (observed weaknesses)

1. **Discoverability:** the dashboard is a generic Hermes console tab, not a product; no mobile PWA; no notifications when something needs him (blocked items sit silently).
2. **Interaction model:** drag-drop works, but the board is read-only from his perspective — his only sanctioned outputs are comments; status moves on gated cards are refused by the CLI (`block` on gated card, `complete` blocked by open parent).
3. **Board hygiene debt visible in data:** placeholder cards with empty titles (`t_4289530f` "P2-36", `t_92441bf4` "P2-37", `t_00785a0c` "P2-38"), an 85h-blocked gate card, and 73 todo cards with no human triage loop.
4. **Historical fragility:** kanban SQLite index corruption under concurrent writes (kanban-db-integrity skill), gateway-restart worker crashes — reinforces "don't touch it".

## Decision (recorded for Gate 1)

- **Do NOT replace** the Hermes kanban or the factory loop. They work; the loop is the worker, `kanban/BOARD.md` is SoT, the Hermes board is the operational mirror.
- **Add** a *presentation + human-interaction layer* on top: Multica (self-hosted, open-source, first-class Hermes driver via ACP) as the native board UI Abdullah opens, plus an idempotent two-way sync bridge.
- **Phase 1 scope = board sync only.** The Multica daemon's Hermes *runtime* (real `hermes acp` execution per issue) is Phase 2, deliberately gated off: concurrent Hermes sessions on the shared working tree would collide with the loop's `kanban/LOCK.json` discipline.
