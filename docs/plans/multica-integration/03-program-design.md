# Gate 3 — Program Design: Bridge Contract & Execution Checklist

## Bridge script contract (`kanban/multica-bridge/bridge.py`, Python stdlib only)

### Invocation & env
```bash
export HERMES_HOME=/home/ubuntu/.hermes/profiles/koralink   # kanban CLI context
export MULTICA_WORKSPACE_ID=<workspace-uuid>                 # or `multica workspace switch`
python3 /home/ubuntu/projects/koralink/kanban/multica-bridge/bridge.py \
  --board koralink-factory-loop \
  --project <multica-project-id> \
  --state kanban/multica-bridge/state.json
```
Exit codes: 0 = ok (no-op or synced) · 1 = partial failure (report, keep going) · 2 = fatal (auth/binary missing). Every line logged `logger → journald` (`--user`), prefixed `multica-bridge`.

### Subprocess calls (all `subprocess.run([...], capture_output=True, text=True)`)
Hermes (always with `env -u HERMES_DELEGATED_CHILD_CONTEXT` — run #21 lesson):
```
hermes kanban --board <board> list --json
hermes kanban --board <board> show <id>              # comment thread: "[YYYY-MM-DD HH:MM] author: text"
hermes kanban --board <board> comment <id> "<text>"  # append (pull side)
```
Multica (PAT-authenticated CLI):
```
multica issue list --output json --project <id> --metadata hermes_task_id=<tid>   # dedupe lookup
multica issue create --title "<title>" --description-stdin --status <s> --priority <p> --project <id>
multica issue get <key> --output json
multica issue update <key> --description-stdin
multica issue status <key> <status>
multica issue comment list <key> --since <ts>
multica issue comment add <key> --content-stdin
multica issue metadata set <key> hermes_task_id=<tid>
```

### Data shapes
- Hermes card (from `list --json`): `{id, title, body, status, priority, assignee, updated_at}` — **verified live** (id `t_a8904eed` et al.).
- Multica issue key format `MUL-<n>` (workspace-scoped, never short-uuid).
- Priority map: `P0→urgent · P1→high · P2→normal · (none)→low`.
- Status map: table in 02-architecture.md.
- Body on create = Hermes body + `\n\n— mirror of kanban/BOARD.md (hermes card <id>) · factory loop board · via koralink-bridge`.
- Bridge-owned Multica comments end with `— via koralink-bridge`; pull side skips them.
- Hermes-side comments written by pull get prefix `[multica] `.

### Idempotency (verified-safe paths)
1. Lookup by `issue list --metadata hermes_task_id=<tid>` (repeatable metadata filter is a documented CLI flag).
2. State.json as the fast path; metadata query as the source of truth; never create when either says the card exists.
3. Body-change detection by sha256 of description; comment sync by watermark timestamps (Hermes show comments / Multica `--since`).

### Push-side comment watermark
Parse `hermes kanban show <id>` output comments; watermark = max timestamp of comments already synced (state). New comments (loop's "built/verified/BLOCKED (run #N)" lines, and Abdullah's `[multica]`-echoed lines) are appended to the Multica issue timeline in order.

### Pull-side rules
- Only comments by the human member account are echoed (all comments not carrying the bridge marker — the bridge runs under the same PAT, so the marker is the discriminator).
- Multica status ≠ state status → echo comment `[multica] moved to <status>`; do NOT run `hermes kanban` status mutations on mirror cards (gated; refusals expected and non-fatal).
- Multica comments are never edited/deleted; Hermes comments are append-only.

## Execution checklist (Gate 4, on approval)

1. **Preflight:** `git status --short` (expect foreign `.gitignore`/`docs/architecture` changes — do not touch); `gh auth` OK; confirm ports 3010/8081 free (`ss -tlnp`).
2. **Install Multica:** clone → `.env` with ports/URLs per 02 → `make selfhost` → compose override for TS IP bind → `curl /readyz` ok.
3. **Workspace:** create "KoraLink" (email code from backend logs) → PAT → `multica login --token` → `multica workspace switch koralink` → create project "KoraLink Factory" → create custom statuses (optional: `Ready` (todo cat.), `Scheduled` (backlog cat.)).
4. **Bridge:** write `bridge.py` (contract above) → dry-run `--check` mode (list-only, print plan) → first real run = **migration** → verify: Multica issue count == Hermes card count (75) and zero duplicates on second run.
5. **Timer:** systemd user unit `koralink-multica-bridge.timer` (every 10 min, `OnBootSec=2m`) → journald verification of a no-op run.
6. **Access check:** open `http://100.93.99.24:3010` from desktop + mobile (Tailscale); confirm board renders, issue timeline shows run comments.
7. **Hard gate:** `turbo run build` from repo root (expect unchanged/green — no product code touched); `git status` shows only `kanban/multica-bridge/` + `docs/plans/multica-integration/` as our paths → conventional commit → push.
8. **Docs:** update `kanban/multica-bridge/README.md` (ops runbook: restart, upgrade, rollback); note in `kanban/README.md` that Multica is the human UI and the loop is unchanged.

## Rollback (30 min max)

1. `systemctl --user stop koralink-multica-bridge.timer`
2. Delete Multica project/issues (web: delete project; CLI: issues deletable) — Hermes kanban untouched except appended `[multica]` comments (harmless; can be left).
3. `docker compose -f docker-compose.selfhost.yml down` (volumes kept) or `down -v` for full removal.
4. No code in the product tree changes → nothing to revert in the repo beyond deleting the bridge dir if unwanted.

## Tailored Multica features (adoption map, Phase 1 uses → Phase 2 candidates)

| Multica feature | Phase 1 use | Phase 2 |
|---|---|---|
| Board/table/Gantt/swimlane views | Board for Abdullah | — |
| Issue timeline + execution log | Loop run comments visible | Live `hermes acp` transcripts per issue |
| Comments/@mentions | Abdullah's interaction surface; bridge echoes | @mention factory agent → new run |
| Inbox notifications | Run failures / blocked items ping Abdullah | — |
| Skills | (import runbook checklists as skills) | Skills injected into hermes ACP runs via HERMES_HOME overlay |
| Autopilots | Optional nightly board digest | Alternate loop trigger (cron stays primary) |
| Projects/sub-issues/stages | Project "KoraLink Factory"; P-levels as labels | Parent issue = loop; stages = P0→P2 |
| Custom statuses | Ready/Scheduled columns | — |
| GitHub PR linking | (off) | Factory commits linked per issue |
| Mobile app / PWA | Mobile browser | Native app |
| Runtimes (daemon) | OFF — CLI API only | Dedicated Hermes runtime + LOCK discipline + dedicated OS user |

## Open decisions (need Abdullah)

1. Phase 2 runtime dispatch — approve later, never in this cycle.
2. Custom statuses `Ready`/`Scheduled` — create now or default mapping only?
3. Other 5 kanban boards — mirror as additional Multica projects, or factory board only?
