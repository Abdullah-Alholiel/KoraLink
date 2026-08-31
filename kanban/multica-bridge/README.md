# KoraLink ↔ Multica Bridge

Two-way sync between the Hermes kanban board `koralink-factory-loop` and the
Multica board (workspace **KoraLink**, project **KoraLink Factory**).

- **Push (Hermes → Multica):** near-real-time event tailer (5 s poll) over the
  kanban SQLite DB (`~/.hermes/kanban/boards/koralink-factory-loop/kanban.db`,
  read-only, high-water marks on `tasks.updated_at` + `task_comments.id`).
  Factory run comments ("built in run #N", "verified in run #N",
  "BLOCKED (run #N)") and status changes land on the Multica issue timeline.
- **Pull (Multica → Hermes):** 2 min poll. Abdullah's / agent comments and
  status moves are echoed onto the matching Hermes card comment thread
  (`[multica] …`). New Multica issues become Hermes cards (`[multica]` prefix)
  gated under the convention parent `t_ce9a513a`.

## Modes

```bash
# dry run (prints plan, writes nothing)
python3 kanban/multica-bridge/bridge.py --migrate --check --project <pid>

# one-shot push (also the initial migration + catch-up)
python3 kanban/multica-bridge/bridge.py --migrate --project <pid>

# continuous services (systemd, see units below)
python3 kanban/multica-bridge/bridge.py --push-watch --project <pid>
python3 kanban/multica-bridge/bridge.py --pull-watch --project <pid>
```

Env needed: `HERMES_HOME=/home/ubuntu/.hermes/profiles/koralink` for the hermes
CLI context; `multica` CLI authenticated (PAT) and `MULTICA_WORKSPACE_ID` set
(or pass `--workspace-id`).

## systemd (user units)

- `koralink-multica-push.service` — continuous push tailer.
- `koralink-multica-pull.service` + `.timer` — pull every 2 min.

```bash
systemctl --user status koralink-multica-push koralink-multica-pull.timer
journalctl --user -u koralink-multica-push -f --output=short-iso
```

## Idempotency & safety

- Multica issues are keyed by metadata `hermes_task_id=<t_xxx>`; re-runs never
  duplicate. `state.json` (`kanban/multica-bridge/state.json`, gitignored) is
  the fast path; metadata is the source of truth.
- Bridge never writes the Hermes DB and never touches Multica's Postgres —
  writes go through `hermes kanban comment` / `multica issue …` only.
- Mirror-card statuses are never mutated on the Hermes side; Multica moves are
  echoed as comments.
- Failures are per-item and non-fatal (exit 1 = partial, 2 = fatal).

## Multica server (self-host, `/home/ubuntu/multica`)

- Ports: web `100.93.99.24:3010`, API `100.93.99.24:8081` (compose override
  `compose.tailscale.yml` adds the Tailscale-IP bind; base binds 127.0.0.1).
- Health: `curl http://localhost:8081/readyz` → `{"status":"ok",…}`.
- Upgrade (off-peak, weekly releases): `git pull` → `docker compose
  -f docker-compose.selfhost.yml -f compose.tailscale.yml up -d` (re-reads .env).
- Login codes (no SMTP configured): `docker compose -f
  docker-compose.selfhost.yml logs backend | grep "Verification code"`.
- Rollback: stop the two bridge units → delete the Multica project/issues →
  `docker compose -f docker-compose.selfhost.yml down` (keep volumes) or
  `down -v` (full). Hermes side only ever gained comments/`[multica]` cards.

## Phase 2a — agents & Growth squad

- Hermes profile `multica-agents` (separate from `koralink`: no memory/session
  pollution; own quota budget notes in `docs/plans/multica-integration/`).
- Daemon: `multica daemon start` → `multica runtime list` shows the VPS runtime
  (hermes on PATH). Guardrails baked into agent instructions: respect
  `kanban/LOCK.json`, repo off-limits unless the issue says otherwise,
  never `git add -A`.
- Quota: agents share the profile keys; keep `agent_timeout`/iteration caps set
  and monitor GLM/DS usage (see koralink-factory-loop → quota-economics).

### Agent registry (workspace `KoraLink`)

All agents run bound to the local **Hermes (aa)** runtime and pass
`custom_args: ["-p", "multica-agents"]` so they drive the isolated Hermes
profile (its `koralink-*` skills load at runtime).

| Agent | ID | Avatar | Role | Bound skills | Notes |
|---|---|---|---|---|---|
| KoraLink Finance | `00becbeb-a0c8-4acb-8c4c-b01eba4f3a4c` | ⚡ | Financial analysis & spend digests (read-only) | — | Fully profiled 2026-08-31 |
| KoraLink Marketing | `716e50c4-6ae2-46ef-ae86-f5180a68fc10` | 🌈 | Marketing copy & landing drafts EN+AR (read-only) | — | Growth squad leader |
| KoraLink Analytics | `b78b4e8c-e587-46d8-8639-24c7cb8e3bec` | 🐼 | Product analytics & measurement (read-only) | PostHog, Sentry, Sentry Error Triage, SQL Toolkit, Retention, Agent Analytics | Fully harnessed 2026-08-31: instructions + autopilot + squad |

### KoraLink Analytics harness (2026-08-31)

- **Instructions**: full ROLE/HARD-RULES/BRIDGE-MIRRORS prompt mirroring
  Finance/Marketing; measurement framework = activation funnel
  (`signup → first_match_join → first_hosted_match`), growth loop
  (`invite_sent → invite_accepted → match_shared → venue_qr_scan`),
  D1/D7/D30 retention, Sentry triage (≥500 only; 4xx noise filtered).
- **Skills** (imported from clawhub.ai, workspace-scoped): PostHog
  (`oomol/oo-posthog`), Sentry Error Triage (`charlie-morrison`), Sentry API
  (`byungkyu/sentry-api`), SQL Toolkit (`gitgoodordietrying/sql-toolkit`),
  Retention (`ivangdavila/retention`), Agent Analytics (`dannyshmueli/agent-analytics`).
- **Autopilot** `4bdd35a6` — "Weekly progress report": `create_issue` mode,
  cron `TZ=Africa/Cairo 0 17 * * 0` (Sun 17:00 Cairo), assigned to the agent;
  description includes kanban metrics + product-analytics section
  (funnel/retention/Sentry spikes from `kanban/RUNS/*.md`).
- **Squad** `1a680b0c` "Growth" — leader Marketing, members Finance (Finance
  Lead) + Analytics (Analytics Lead).
- Manage: `multica agent get <id>`, `multica agent skills list <id>`,
  `multica autopilot list`, `multica squad get 1a680b0c`.
