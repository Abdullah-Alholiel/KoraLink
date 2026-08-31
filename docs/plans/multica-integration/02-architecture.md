# Gate 2 — Architecture: Multica + Sync Bridge

## Verified facts (research 2026-08-31, evidence-cited)

- Multica is open-source (Apache-2.0 + conditions), ~48.3k stars; stack: Next.js 16 web, Go backend, PostgreSQL 17; self-host via `make selfhost` (3 containers: postgres/backend/frontend).
- **First-class Hermes driver**: `server/pkg/agent/hermes.go` (ACP transport: drives `hermes acp`, blocks `acp` arg overrides, parses `-p/--profile` selection); daemon execenv: `hermes_sessions.go` (per-conversation state.db shards), `hermes_memory.go`, `hermes_home.go` (per-task HERMES_HOME overlay + skill injection). Hermes is on the official runtime table (detected command `hermes`).
- **CLI surface (bridge-critical, from `cmd_issue.go` + docs/cli.mdx):**
  - `multica issue list --output json --status/--assignee/--project/--metadata <k=v>`
  - `multica issue create --title --description-stdin --status --priority --project`
  - `multica issue get <key>`, `update <key>`, `status <key> <status>`, `assign <key> --to`
  - `multica issue comment list <key> --since`, `comment add <key> --content-stdin`
  - `multica issue metadata set <key> k=v` (idempotency anchor)
  - Headless auth: `multica login --token` (PAT), profiles in `~/.multica/`.
- **Issue model:** 7 built-in status categories = board columns: `backlog, todo, in_progress, in_review, done, blocked, cancelled`; custom statuses allowed per category; board columns are categories.
- **Hermes side:** `hermes kanban --board <slug> list --json` emits full cards (verified); `show <id>` includes comment thread with timestamps; kanban DB at `~/.hermes/kanban/boards/<slug>/kanban.db`.
- **VPS fit (verified):** Docker 27.0.3 + compose v5 ✓ · 77G disk free ✓ · 15G RAM available ✓ · port 3000 taken (player-pwa standalone next-server, pid 2928999) → remap Multica to 3010/8081 via `FRONTEND_PORT`/`BACKEND_PORT` (compose honors them; containers bind 127.0.0.1 → override for Tailscale IP).

## Topology

```
┌─────────────────────────────── VPS (100.93.99.24) ───────────────────────────────┐
│                                                                                  │
│  Abdullah (desktop/mobile, Tailscale)                                             │
│    │ https? http://aa.tail2948f9.ts.net:3010   (or Traefik :443 route, later)    │
│    ▼                                                                             │
│  Multica frontend (:3010) ──► Multica backend (:8081) ──► multica-postgres       │
│         ▲                              ▲                                          │
│         │      multica CLI (PAT auth, ~/.multica)                                │
│  ┌──────┴───────┐        ┌─────────────────────────────┐                          │
│  │ BRIDGE       │◄──────►│ Hermes kanban CLI            │                          │
│  │ bridge.py    │  cron  │ hermes kanban --board        │                          │
│  │ + state.json │ every  │   koralink-factory-loop      │                          │
│  │ (systemd     │  10m   │ (HERMES_HOME=koralink)       │                          │
│  │  timer)      │        └──────────────┬───────────────┘                          │
│  └──────────────┘                       │                                          │
│                    ~/.hermes/kanban/boards/koralink-factory-loop/kanban.db         │
│                    kanban/BOARD.md (SoT) ◄── factory loop cron writes ──┐          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Deliberate constraints**
- The Multica **daemon is NOT started in Phase 1** (it exists to execute agent CLIs; board sync uses the CLI's API commands only). This prevents accidental `hermes acp` dispatch and concurrent-session collisions with the factory loop.
- Hermes kanban statuses on mirror cards are **never mutated by the bridge** (gated under `t_ce9a513a`; `block`/`complete` refused by design). Multica status moves by Abdullah are reflected as *comments* on the Hermes card.

## Status mapping (Hermes kanban → Multica)

| Hermes status | Multica status/category | Notes |
|---|---|---|
| triage | backlog | parked |
| todo | todo | |
| scheduled | backlog + due date | or custom status "Scheduled" (backlog category) |
| ready | todo | custom "Ready" (todo category) optional |
| running / in-progress | in_progress | |
| blocked | blocked | |
| review | in_review | built-in |
| done | done | |
| archived | cancelled | record kept |

Priority: P0→urgent, P1→high, P2→normal, unrated→low. Labels: `P0`, `P1`, `P2`, `mirror`.

## Sync algorithm (bridge.py)

State file: `kanban/multica-bridge/state.json` (in-repo, committed with bridge runs):
```json
{"hermes_task_id": {"multica_key": "MUL-42", "body_sha": "...", "status": "todo",
 "last_hermes_comment_ts": 0, "last_multica_comment_ts": 0}}
```

**Push (Hermes → Multica), per card from `list --json`:**
1. Not in state → `issue create` (title keeps `[Px]` prefix; body = Hermes body + "Mirror of kanban/BOARD.md"; status/priority mapped; project KoraLink Factory) → `issue metadata set <key> hermes_task_id=<id>` → record state.
2. In state → `issue get <key>`: status differs → `issue status`; body sha differs → `issue update --description-stdin`; Hermes comments newer than `last_hermes_comment_ts` → `issue comment add` with suffix `— via koralink-bridge` (marks bridge-owned comments so the pull side skips them).

**Pull (Multica → Hermes), per issue in state:**
3. `issue comment list <key> --since <last_multica_comment_ts>`: comments NOT containing `via koralink-bridge` → `hermes kanban --board koralink-factory-loop comment <id> "<Multica| <author> <ts>: <text>>"`.
4. Multica status changed vs state (moved by Abdullah, not by push) → Hermes comment: `[multica] Abdullah moved to <status>` (status itself left untouched).
5. Write state; exit 0. Every failure logged to journald; failures never fatal (mirror rule).

## Deployment & access

- `git clone --depth 1 https://github.com/multica-ai/multica.git` → `make selfhost` with `.env`: `FRONTEND_PORT=3010`, `BACKEND_PORT=8081`, `FRONTEND_ORIGIN=http://100.93.99.24:3010`, `MULTICA_APP_URL` same, `MULTICA_PUBLIC_URL=http://100.93.99.24:8081`; compose override file binds `100.93.99.24:3010` / `100.93.99.24:8081` (Tailscale-only, consistent with :9119 dashboard pattern).
- Verify `curl http://100.93.99.24:8081/readyz` → `{"status":"ok",...}`.
- Workspace "KoraLink"; login via email verification code read from backend logs (`docker compose -f docker-compose.selfhost.yml logs backend | grep "Verification code"`).
- CLI: `curl -fsSL …/install.sh | bash`; create PAT in web settings (headless machine) → `multica login --token`; `multica workspace switch koralink`.
- Bridge: `kanban/multica-bridge/bridge.py` + systemd user timer (every 10 min) or Hermes no_agent cron — zero LLM cost either way.
- **Security note:** Multica binds only to the Tailscale IP; CLI config (`~/.multica`) contains a PAT — chmod 600, never committed. Multica's own Postgres is a separate container (no collision with koralink DB on :5432, which stays host-bound).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Concurrent Hermes sessions if daemon accidentally enabled | Daemon OFF in Phase 1; bridge uses CLI API only |
| Duplicate issues on re-run | `hermes_task_id` metadata + state.json; verified by count |
| Bridge races the loop's writes | Read-only on Hermes except `comment`; loop tolerates foreign comments |
| Multica weekly releases | Pin images at install; upgrade = git pull + `up -d`, off-peak |
| Port collisions | 3010/8081 verified free |
| Abdullah's Multica status moves lost | Reflected as Hermes comments; Phase 1.5 proposal: loop Phase 2 reads `[multica]` comments for re-prioritization (separate small runbook change, needs its own approval) |
