# Gate 2 — Architecture: Multica as the Native KoraLink Kanban Board (rev 2, 2026-08-31)

## Verified facts (research 2026-08-31, evidence-cited)

- Multica open-source (Apache-2.0 + conditions), ~48.3k stars; Next.js 16 web, Go backend, PostgreSQL 17; `make selfhost` (postgres/backend/frontend).
- **First-class Hermes driver**: `server/pkg/agent/hermes.go` (drives `hermes acp` — ACP JSON-RPC; `acp` arg blocked from override; `-p/--profile` parsed and passed through for skill-less tasks, stripped when a per-task overlay is built); execenv `hermes_{sessions,memory,home}.go` (per-conversation `state.db` shards, HERMES_HOME overlay, skill injection).
- **CLI surface (bridge-critical):** `multica issue list/get/create/update/status/assign/comment/subscriber/metadata`, `multica agent create/update`, `multica skill`, `multica squad`, `multica autopilot`, `multica workspace` — all with `--output json`; headless auth via PAT (`multica login --token`); profiles in `~/.multica/`.
- **Issue model:** 7 built-in status categories = board columns (`backlog, todo, in_progress, in_review, done, blocked, cancelled`); custom statuses per category; board columns are categories.
- **No outbound webhooks** (open feature request #1020); inbound webhooks exist (#2373, autopilot triggers). **Plugin hooks** are plugin-manifest call sites, not general outbound event streams. → Multica→Hermes direction must poll (fast cadence).
- **Hermes kanban:** `hermes kanban list --json` (verified); `show <id>` includes comments; kanban SQLite at `~/.hermes/kanban/boards/<slug>/kanban.db` with a **`task_events` table the dashboard live-tails over WebSocket** (`/api/plugins/kanban/events`) → Hermes→Multica can be **event-driven (push)**, not polled.
- **VPS fit (verified):** Docker 27.0.3 + compose v5 ✓ · 77G disk ✓ · 15G RAM avail ✓ · :3000 taken (player-pwa standalone) → Multica remapped to 3010/8081 via `FRONTEND_PORT`/`BACKEND_PORT`; compose binds 127.0.0.1 → override for Tailscale IP.

## Data-flow model (rev 2 — Multica is the FRONT DOOR, not just a mirror)

```
┌─────────────────────────────── VPS (100.93.99.24) ───────────────────────────────┐
│                                                                                  │
│  Abdullah (desktop/mobile, Tailscale)                                             │
│    │ http://aa.tail2948f9.ts.net:3010 (web)                                       │
│    ▼                                                                            │
│  ┌──────────────────────────── Multica ─────────────────────────────┐            │
│  │ frontend (:3010) ──► backend (:8081) ──► multica-postgres        │            │
│  │   • Agents:  "KoraLink Finance", "KoraLink Marketing", … (Phase 2a)│          │
│  │   • Squads:  "Growth" (leader + members)  (Phase 2a)             │            │
│  │   • Issues:  factory mirror cards + Abdullah's new work           │            │
│  │   • Autopilot: optional nightly digest                            │            │
│  └───────▲────────────────────────────┬──────────────────────────────┘            │
│          │ CLI+PAT (writes)          │ REST/CLI (writes)                          │
│   ┌──────┴──────────┐      ┌─────────┴──────────────┐                              │
│   │ BRIDGE PULL     │      │ BRIDGE PUSH (event-    │                              │
│   │ (poll 1-2 min)  │      │ tailer, ~3-5s)         │                              │
│   │ Multica→Hermes  │      │ Hermes→Multica         │                              │
│   └──────▲──────────┘      └─────────▲──────────────┘                              │
│          │ comments/status          │ read-only: task_events high-water mark      │
│   ┌──────┴──────────────────────────┴───────────────┐                              │
│   │ Hermes kanban CLI (HERMES_HOME=koralink) + DB    │                              │
│   │ ~/.hermes/kanban/boards/koralink-factory-loop/   │                              │
│   │ kanban.db  ◄── factory loop cron writes ── BOARD.md (SoT)                      │
│   └──────────────────────────────────────────────────┘                             │
│   Phase 2a (gated): multica daemon (owns runtime) → hermes acp sessions            │
│   for Finance/Marketing agents — dedicated Hermes profile, LOCK-aware,             │
│   separate quota budget.                                                           │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Two directions, both real:**

| Direction | Mechanism | Latency |
|---|---|---|
| Hermes → Multica (loop activity, factory mirror) | **Event-tailer**: read-only high-water-mark poll of SQLite `task_events` (3–5s) → Multica API/CLI | ~seconds |
| Multica → Hermes (Abdullah's comments/status moves, new issues) | Fast poll (1–2 min) via `multica issue comment list --since` / `issue list` | ~1–2 min |
| Multica → Hermes (new work front-door) | Bridge creates Hermes cards tagged `[multica]`; optional runbook delta boards them into BOARD.md | next loop run |

**Front-door model (Abdullah's mental model):** Abdullah creates issues + assigns to Finance/Marketing agents/squads in Multica → agents run (Phase 2a) → results + status land in the issue timeline → bridge mirrors the whole lifecycle into Hermes kanban (new cards, comments, status notes) → the factory loop's review pass (optional small runbook delta) can board `[multica]` items into BOARD.md for gated building. Factory-built items flow back Multica-wards the same way. Hermes kanban remains the complete cross-system record; `kanban/BOARD.md` stays the loop's SoT.

## Status mapping (unchanged from rev 1)

triage→backlog · todo→todo · scheduled→backlog(+due) · ready→todo · running/in-progress→in_progress · blocked→blocked · review→in_review · done→done · archived→cancelled. Priority P0→urgent · P1→high · P2→normal · none→low. Labels: `P0/P1/P2`, `mirror`, `[multica]`.

## Agents & squads (Phase 2a — "tailored to financials/marketing")

- **Agents** = reusable config (name, instructions, model, skills, runtime). Create `KoraLink Finance` + `KoraLink Marketing` bound to the VPS Hermes runtime; attach Multica skills (runbook checklists imported via `multica skill import`).
- **Squads** = leader + members; assign an issue to the squad → leader coordinates. E.g. "Growth" squad led by Marketing agent.
- **Runtime & isolation (critical):**
  1. Daemon runs as `ubuntu` → Multica docs recommend a dedicated user/container; accepted for this single-user VPS, revisit if repo-touching tasks are allowed.
  2. **Separate Hermes profile** (e.g. `multica-agents`) for Multica-driven sessions → no memory/session pollution of the koralink profile, and the driver's per-task HERMES_HOME overlay already isolates state per issue.
  3. **Quota guardrail:** hermes acp sessions burn GLM/DeepSeek keys. If the agents share the koralink profile keys they eat the factory loop's Lite-plan budget (2,000/5h, 10k/wk) → give the `multica-agents` profile its own keys, or a hard budget note + `agent_timeout`/iteration caps in the daemon env.
  4. **LOCK discipline:** agents that may touch `/home/ubuntu/projects/koralink` get instructions to respect `kanban/LOCK.json` + `git status` before any write; default = run in scratch/own workdir, repo off-limits unless the issue says otherwise.
- **Auto-update of Hermes kanban tasks:** every Multica issue created by Abdullah or an autopilot → bridge creates a Hermes card (`[multica]` prefix, source metadata); every status change/comment → Hermes card comment; when the factory loop completes a mirrored item, bridge sets the Multica issue `done`. So the Hermes board is always current without Abdullah touching the CLI.

## Streaming upgrade rationale (rev 2 vs rev 1)

Rev 1 polled both directions every 10 min via CLI. Rev 2: Hermes→Multica becomes near-real-time (task_events tail — the same source the dashboard's WebSocket uses, but read directly from SQLite so the bridge doesn't depend on the dashboard process); Multica→Hermes stays a short poll because outbound webhooks don't exist yet (#1020). Structured DB reads replace CLI text parsing for the Hermes side (no fragile `show` output parsing); writes stay CLI/REST (never write the Hermes DB directly — trigger/event consistency; never write Multica's Postgres).

## Risks & mitigations (rev 2)

| Risk | Mitigation |
|---|---|
| Concurrent Hermes sessions (loop vs Multica agents) | Daemon agents LOCK-aware + separate profile + repo off-limits by default |
| Quota exhaustion from agent runs | Separate profile keys / hard caps; monitor via existing quota tooling |
| Bridge races the loop's writes | Read-only on Hermes DB; CLI writes only for comments; failures non-fatal |
| Duplicate issues | `hermes_task_id` metadata + state.json + count verification |
| No outbound webhooks (Multica→Hermes) | 1–2 min poll; human-paced interactions don't need sub-second |
| Multica weekly releases | Pin images; upgrade off-peak (`git pull` + `up -d`) |
| task_events schema drift | Bridge introspects `PRAGMA table_info(task_events)` at start; unknown events ignored |
| Daemon full-permission execution | Dedicated OS user (later); repo guardrails now; log everything |
