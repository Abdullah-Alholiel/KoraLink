# Gate Status — Multica Integration (2026-08-31)

| Gate | Doc | Status |
|---|---|---|
| Gate 0 — Retrospective | `00-retro.md` | ✅ DONE (board-usage debt, decision: add layer, don't replace) |
| Gate 1 — Product | `01-product.md` | ✅ DONE (scope Phase 1 board-sync; Phase 2 gated) |
| Gate 2 — Architecture | `02-architecture.md` | ✅ REV 2 (2026-08-31: two-way front-door model, event-tailer streaming, agents/squads Phase 2a) |
| Gate 3 — Program Design | `03-program-design.md` | ✅ REV 2 (2026-08-31: push/pull contract, Phase 2a agent checklist, quota guardrails) |
| Gate 4 — Vertical Slices | — | ⏸ **AWAITING ABDULLAH'S APPROVAL** (install nothing until then) |

## How to approve

Say **"proceed"** / **"okay"** / **"do recommended"** → Gate 4 executes the checklist in `03-program-design.md` (install Multica → migrate 75 cards → bridge push tailer + pull poll → optional Phase 2a agents/squads → build gate → push).

Scope options:
- **B (recommended):** board sync + Phase 2a — Finance/Marketing agents + Growth squad (daemon ON, guarded, pilot-first).
- **A:** board sync only (daemon OFF, agents configured but idle).
- **C:** hold; docs only (current state).

Separate approvals needed (only if B): runbook delta for the loop (Phase 2 reviewer boards `[multica]` cards), and `multica-agents` profile quota choice.

## Phase 2a progress (2026-08-31)

- Agents **KoraLink Finance**, **KoraLink Marketing**, **KoraLink Analytics**
  created in workspace `KoraLink` (project `KoraLink Factory`), all bound to
  the local Hermes runtime with `custom_args: ["-p", "multica-agents"]`.
- Squad **Growth** (`1a680b0c`): leader Marketing; members Finance + Analytics.
- **KoraLink Analytics fully harnessed** (2026-08-31): full instructions
  (measurement framework: activation funnel, growth loop, D1/D7/D30 retention),
  6 bound skills (PostHog, Sentry ×2, SQL Toolkit, Retention, Agent Analytics),
  autopilot `4bdd35a6` "Weekly progress report" (Sun 17:00 Cairo,
  create_issue). Registry + ops in `kanban/multica-bridge/README.md`.
- Daemon runtime online; autopilot first run pending (next 2026-09-06).

## Research evidence (primary sources)

- Multica repo: `github.com/multica-ai/multica` (README, SELF_HOSTING.md, `server/pkg/agent/hermes.go`, `server/internal/daemon/execenv/hermes_{sessions,memory,home}.go`, `server/cmd/multica/cmd_issue.go`, `docker-compose.selfhost.yml`, `.env.example`).
- Docs: multica.ai/docs — concepts, issues, tasks, triggering-agents, cli, self-host-quickstart, install-agent-runtime.
- Hermes kanban live state: `hermes kanban boards list` + `--board koralink-factory-loop list` (73 todo / 2 blocked / gate card; verified JSON output shape).
