# Gate Status — PR Review Automation

| Gate | Artifact | Status |
|---|---|---|
| 0 Retro | 2026-09-22 session: quota audit (4% weekly used), peak-time audit (factory all off-peak), tool comparison (PR-Agent vs Pullfrog/Robin/CCR/Kodus via zread MCP) | DONE |
| 1 Problem | 01-program-design.md §Gate 1 | DONE |
| 2 Architecture | 01-program-design.md §Gate 2 (D1–D4, evidence-cited) | DONE |
| 3 Program Design | 01-program-design.md §Gate 3 (output contract, triggers, secrets, done-when) | DONE |
| 4 Vertical Slices | S1+S2 committed (PR #28, merged). S3 evidence: real GLM review posted 19:18Z+19:20Z (3 security findings, file:line linked, machine-greppable), Semgrep green incl. custom rules, secrets stored via gh secret set | **DONE 2026-09-23** |

## Post-build lessons (2026-09-23)
- qodo-ai/pr-agent@main action drifted (ran /describe, no `commands` input) → use codiumai/pr-agent Docker CLI, image pinned by digest.
- Repo `.pr_agent.toml` is read from the DEFAULT branch (main=release-only) and the container can't see the workspace → all config via `--section.key` CLI args. `PR_AGENT__CONFIG__*` env overrides are NOT honored by the docker CLI.
- GitHub auth in docker mode needs `PR_AGENT__GITHUB__USER_TOKEN` env binding; bare `GITHUB_TOKEN` env is ignored there.
- Env-file secret passing failed twice (bindings lost; printf `%s` count mismatch passed silently until a guard was added) → reverted to proven argv bindings; ephemeral-runner argv exposure accepted, re-pin digest on upgrade.
- PR-Agent reports "success" even on internal failures (propagate_tool_errors=false) — ALWAYS grep run logs for ERROR lines; duration <45s = it never called the LLM.
- Webhook delivery for pull_request triggers proved flaky twice (runs missing for pushed SHAs) → workflow_dispatch(pr_url) added; `gh workflow run` needs a PAT with Actions:write (GITHUB_TOKEN 403s — owner can dispatch from the UI Actions tab).

Owner decisions queued: T1 mint ZAI_PR_REVIEW_KEY (z.ai dashboard) · T2 approve Gate 4.
