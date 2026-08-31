# Gate 1 — Product Spec: Multica as the Native KoraLink Kanban Board

## Problem statement

Abdullah cannot comfortably see or interact with the factory kanban. The Hermes dashboard is a generic console tab (no mobile, no notifications), and the board's only sanctioned interaction is comments. He wants a product-grade board he opens daily, with the factory loop running exactly as it does today underneath.

## Users & jobs

| Persona | Job |
|---|---|
| Abdullah (operator) | Open the board from any device; see every factory item with priority/status; comment, drag, re-prioritize; get notified when a run fails or an item needs him |
| Factory loop (cron) | Unchanged. Continues to write `kanban/BOARD.md`, Hermes kanban mirror cards, and run comments |
| Bridge (new) | Mechanical two-way sync; no LLM cost; idempotent; failures non-fatal |

## Scope

### In scope (Phase 1 — board sync)
1. Self-host Multica on the VPS (Docker compose; own Postgres; ports remapped off 3000).
2. One workspace "KoraLink" + one project "KoraLink Factory".
3. One-shot migration of all 75 cards from Hermes kanban `koralink-factory-loop` → Multica issues (idempotent, keyed by `hermes_task_id` metadata).
4. Continuous two-way sync bridge (every ~10 min):
   - Hermes → Multica: status, title/body changes, and loop run comments ("built in run #N", "verified in run #N", "BLOCKED (run #N)") appear on the Multica issue timeline.
   - Multica → Hermes: Abdullah's comments and status moves are appended to the matching Hermes card's comment thread (Hermes statuses never mutated on gated mirror cards).
5. Abdullah access: web UI on Tailscale IP (desktop + mobile browser); optional inbox notifications for run failures / blocked items.
6. Hermes kanban stays the durable operational record; `kanban/BOARD.md` stays SoT. Loop untouched. Rollback = stop the timer; Hermes side only ever gains comments.

### Out of scope (Phase 2 — decided later, explicitly gated)
- Multica daemon → real `hermes acp` execution of issues on the VPS (requires LOCK discipline integration; daemon-as-ubuntu security review).
- Migrating the other 5 kanban boards (bank-statement-dashboard, momentum-supabase, webportfolio, koralink, default) — bridge is parameterizable; do them only on request.
- Replacing the factory cron with Multica autopilots (cron stays the driver; autopilot only for a board digest, optional).
- GitHub PR-linking enrichment of mirror issues.

## Acceptance criteria (Phase 1 done)

1. `http://100.93.99.24:3010` (or Traefik route) serves Multica; Abdullah can log in from his device and open the KoraLink Factory board.
2. Every Hermes card (73 todo + 2 blocked + gate card) exists as exactly one Multica issue; re-running the bridge creates zero duplicates (verified by count comparison).
3. A loop-style comment added to a Hermes card appears on the Multica issue within one bridge interval.
4. A comment Abdullah writes in Multica appears on the Hermes card's thread within one bridge interval.
5. Bridge runs with zero LLM cost (pure script), failures logged, never blocks the factory loop.
6. Hard gate for this feature: no product build impact (docs/scripts only) — `turbo run build` remains green as-is; run it once post-deploy to confirm nothing drifted.
