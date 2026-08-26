# KoraLink Factory Loop — Kanban & Run History

This directory is the durable memory of the **5-hour autonomous factory loop** running on the
KoraLink VPS (Hermes profile `koralink`, cron job `KoraLink Factory Loop`).

## Why it exists

Cron runs get a fresh session with no chat context. Continuity between runs lives HERE,
committed to git — so every run (and every human) can see what the last run did, verified,
and prioritized. This also satisfies the requirement that all gate/cycle plans live in the repo.

## Files

| File | Purpose |
|---|---|
| `BOARD.md` | The living kanban: P0/P1/P2 across PWA, Admin, API, DB/Infra |
| `STATE.json` | Machine-readable hand-off between runs (last run, commits, blockers) |
| `RUNS/<UTC-timestamp>.md` | Append-only per-run reports: findings, what was built, verification evidence |
| `LOCK.json` | Transient overlap guard (gitignored) — a run < 4.5h old means "skip" |

## The loop (each tick)

1. Preflight (auth, clean tree, lock, pull latest `main`)
2. Restore context from `STATE.json` + latest run report + `git log` since last run
3. `graphify update .` + query-first audit of the codebase
4. **GLM 5.2 comprehensive reviewer** subagent (4 layers + product gaps), deepseek self-review in parallel
5. Re-verify the previous run's claims (build + tests + spot-checks)
6. Update `BOARD.md`, re-prioritize
7. Autonomous compact **4-Gate dev cycle** on the top item → `docs/plans/<cycle>/` → vertical slices
8. `turbo run build` + `npx vitest run` green → conventional commits → push
9. Write run report, update `STATE.json`, release lock, deliver summary (WebUI + Telegram)

Full runbook: Hermes skill `koralink-factory-loop`.
