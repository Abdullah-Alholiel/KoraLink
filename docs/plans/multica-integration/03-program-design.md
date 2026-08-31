# Gate 3 — Program Design: Bridge Contract & Execution Checklist (rev 2, 2026-08-31)

## Components

1. **`bridge.py` (push half — event-tailer)** — Hermes → Multica, near-real-time.
2. **`bridge.py` (pull half — fast poll)** — Multica → Hermes, 1–2 min.
3. **`agent_setup.md` / CLI sequence** — Finance/Marketing agents + squads (Phase 2a).
4. **State + logs** — `kanban/multica-bridge/state.json`, journald (`multica-bridge` tag).

## Bridge contract — push half (Hermes → Multica, event-tailer)

**Source:** `~/.hermes/kanban/boards/<board>/kanban.db`, table `task_events`, read-only connection
(`sqlite3.connect("file:...?mode=ro")`), **high-water-mark by event id**, poll every 3–5 s.
At start: `PRAGMA table_info(task_events)` → build field map; unknown events ignored (schema-drift safe).

**Event → action mapping** (per board `koralink-factory-loop`; parent `t_ce9a513a` excluded from status actions):

| task_events type (observed classes: status_change, comment, create, run/worker events) | Multica action |
|---|---|
| `task_created` | ensure issue exists (create if missing; metadata `hermes_task_id`) |
| `status_change` (loop moves mirror card) | `multica issue status <key> <mapped>` |
| `comment` (loop's "built in run #N / verified in run #N / BLOCKED (run #N)") | `multica issue comment add <key> --content-stdin` (suffix `— via koralink-bridge`) |
| anything else | ignore (log at debug) |

Writes go through the Multica CLI (PAT) — never Multica's Postgres, never the Hermes DB for writes.

## Bridge contract — pull half (Multica → Hermes, poll 1–2 min)

Per issue key in state.json:
1. `multica issue comment list <key> --since <last_multica_comment_ts>` — comments NOT containing `via koralink-bridge` (i.e. Abdullah's, or agents' when Phase 2a) →
   `hermes kanban --board <board> comment <id> "[multica| <author> <ts>] <text>"` (always with `env -u HERMES_DELEGATED_CHILD_CONTEXT`).
2. `multica issue get <key> --output json` — status changed vs state **and** changed by a human/agent (not the push half) → Hermes comment `[multica] moved to <status>`; Hermes status itself never mutated on gated mirror cards.
3. **New issues** in Multica (no `hermes_task_id` metadata, project = KoraLink Factory, created by Abdullah) → `hermes kanban --board <board> create "<[multica] title>" --body "<desc + source key>"` **then immediately** `link t_ce9a513a <new_id>` (gate it — create leaves cards dispatchable; same race as the loop's Phase 3.7, reclaim first if already claimed). Verify `status: todo` + `parents: t_ce9a513a`.
4. Optionally (only with the approved runbook delta): append new `[multica]` card titles to `kanban/BOARD.md` backlog so the loop's reviewer boards them next run.

State.json per card: `{multica_key, body_sha, status, last_hermes_comment_ts, last_multica_comment_ts}`.
Idempotency: lookup by `multica issue list --metadata hermes_task_id=<tid>`; never create when state or metadata says it exists. Exit 0 = ok/no-op · 1 = partial (keep going) · 2 = fatal (auth/binary). Logs → journald `--user`, tag `multica-bridge`.

## Phase 2a — Finance/Marketing agents & squads (gated: daemon ON)

1. Enable daemon: `multica daemon start` (detects `hermes` on PATH → VPS runtime online; `multica runtime list` shows it).
2. **Dedicated Hermes profile** `multica-agents` (config: GLM/DeepSeek keys, own quota budget; skills symlinked: finance/marketing checklists; memory empty). Multica agent instructions reference `-p multica-agents` where pass-through applies; with bound skills the driver builds the overlay (profile stripped) — validate on first real run.
3. Create agents via CLI (or web):
   - `multica agent create --name "KoraLink Finance" --runtime <vps-runtime> --model <provider/model> --instructions <file>` + skills (finance templates).
   - `multica agent create --name "KoraLink Marketing" ...` + marketing skills.
   - `multica squad create --name "Growth" --leader "KoraLink Marketing" --members ...`.
4. **Guardrails baked into agent instructions:** respect `kanban/LOCK.json` + `git status --short` before any repo write; default workdir = agent's own scratch dir; repo `/home/ubuntu/projects/koralink` off-limits unless the issue explicitly says otherwise; never `git add -A`; never touch the factory cron's STATE.json/BOARD.md.
5. Daemon env caps: `agent_timeout`, iteration limits (see Multica env docs) so a runaway run can't burn the week's quota.
6. First pilot: assign ONE small finance issue (no repo writes) → watch run → verify timeline + bridge mirror → then scale.

## Execution checklist (Gate 4, on approval)

1. Preflight: `git status --short` (foreign `.gitignore`/`docs/architecture` — leave alone); `gh auth`; ports 3010/8081 free.
2. Install Multica: clone → `.env` (ports/URLs rev 2) → `make selfhost` → compose override TS-IP bind → `/readyz` ok.
3. Workspace "KoraLink" (email code from backend logs) → PAT → `multica login --token` → `workspace switch` → project "KoraLink Factory" → optional custom statuses (Ready/Scheduled).
4. Bridge: `bridge.py` push+pull → dry-run `--check` → first real run = migration (75 cards) → verify counts + zero duplicates on second run.
5. Timer/daemon: systemd user units — `koralink-multica-bridge-push.service` (continuous tailer) + `koralink-multica-bridge-pull.timer` (1–2 min) → journald verification.
6. **Phase 2a (only if approved):** profile `multica-agents` → daemon → agents Finance/Marketing → squad Growth → pilot issue → verify run + mirror.
7. Access check: web on TS IP:3010 from desktop + mobile; issue timeline shows loop comments; Abdullah comment appears on Hermes card.
8. Hard gate: `turbo run build` green (no product code touched); stage only our paths (`docs/plans/multica-integration/`, `kanban/multica-bridge/`); conventional commit; push.
9. Docs: `kanban/multica-bridge/README.md` ops runbook (restart/upgrade/rollback); note in `kanban/README.md` that Multica is the human UI; loop untouched.

## Rollback

Stop push service + pull timer → delete Multica project/issues → `docker compose -f docker-compose.selfhost.yml down` (volumes kept) or `down -v` full. Hermes side only ever gained comments/`[multica]` cards — removable or harmless. Phase 2a: `multica daemon stop`, archive agents.

## Open decisions (need Abdullah)

1. **Scope for this cycle:** (A) board sync only, (B) board sync + Phase 2a agents/squads, (C) docs only. **Recommendation: B** — finance/marketing agents are the reason to adopt Multica; guardrails make it safe, pilot first.
2. Runbook delta: loop's Phase 2 reviewer scans `[multica]` cards → boards into BOARD.md (small additive change to koralink-factory-loop skill; needs separate approval since it touches the loop).
3. Custom statuses Ready/Scheduled — create or default mapping?
4. Other kanban boards — mirror as projects, or factory board only?
5. `multica-agents` profile quota: own GLM/DS keys vs share factory keys with hard caps?
