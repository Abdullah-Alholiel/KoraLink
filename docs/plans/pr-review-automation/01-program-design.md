# PR Review Automation — Program Design (Gates 1–3)

**Date:** 2026-09-22 · **Status:** Gate 3 complete — awaiting owner approval for Gate 4
**Decided by Abdullah (2026-09-22 session):** PR-Agent (self-hosted, z.ai GLM Flash) + Semgrep OSS.
Claude Pro deferred — shared with the zero-shot repo agent (other session); revisit with `/usage` data.

---

## Gate 1 — Problem & Scope

**Problem.** PRs on koralink (promote PRs staging→main, feature/fix PRs) receive no automated
first-pass review. The factory's Phase 2 reviewers examine the working tree post-cycle, not PRs.
Findings must be (a) concise and (b) machine-readable so any agent can consume them later.

**Requirements.**
1. Every PR gets a short, structured review comment in a FIXED shape (parseable by agents).
2. Deterministic security scanning (no hallucination) runs alongside the LLM review.
3. $0 incremental cost — run on the existing z.ai Lite plan; factory budget stays intact.
4. Zero interference with factory runs, deploys, or `main` (release-only).

**Non-goals.** No Kodus server, no Robin/ChatGPT-CodeReview, no changes to Phase 2 GLM
reviewers, no branch-protection changes, no auto-fix agents (a fix lane is a later cycle).

## Gate 2 — Architecture (decisions + evidence)

**D1 — PR-Agent (Apache-2.0, community-owned since 2026-04) as GitHub Action.**
Runs in-repo, zero infrastructure. `/review` `/improve` `/describe` `/ask`. Per-repo config via
`.pr_agent.toml` — the only candidate that supports a per-repo OUTPUT CONTRACT (the agent-
consumability requirement). Backend: z.ai `glm-5.3-flash` via LiteLLM (OpenAI-compatible
endpoint, no new provider).

**D2 — Semgrep OSS (free, deterministic) in CI for security.**
LLM review is advisory; Semgrep is mechanical: injection patterns, leaked secrets, plus THREE
custom rules encoding KoraLink's standing bug classes (learned the hard way in factory runs):
- `eq(col, null)` → always `isNull()`/`isNotNull()` (P1-1 scheduler zero-rows bug)
- `::uuid` casts → all id columns are `varchar(36)` (runbook standing rule)
- CacheInterceptor on per-user endpoints (stale cross-user data class)

**D3 — Claude Pro NOT used for PR review (deferred, explicit owner decision 2026-09-22).**
The Pro subscription's 5h/weekly pool is earmarked for the zero-shot repo agent (separate
session). No programmatic quota API on subscriptions; a bot competing with interactive work
has no guardrail. Revisit after 1–2 weeks of zero-shot agent `/usage` data.

**D4 — Tokenomics (verified live 2026-09-22 13:46 UTC).**
- z.ai weekly bucket: 4% used (96% free); 5h window: 5%.
- Cost model (official formula, off-peak): small PR ≈ 2.5 cr, re-review ≈ 1.3 cr, big PR ≈ 6.2 cr.
- Worst case 50 big PRs/week all peak = 617 cr = **6.2% of weekly bucket**; normal = 0.6%.
- Peak audit: factory loop fires 01:15/10:15/15:15 UTC — all off-peak. Peak-window jobs
  exist only outside koralink (multica watchdog, vps-admin trivy) with negligible burn.
- Exhaustion failure mode is benign: PR review 429s → no bot comment → nothing else affected.
- Factory prestate guard (75% weekly → failover) already covers the added drain.

## Gate 3 — Contracts

### `.pr_agent.toml` (repo root) — the output contract

```toml
[config]
response_language = "en"
max_description_tokens = 500
max_model_tokens = 16000          # guard vs truncation on huge diffs

[pr_reviewer]
require_security_review = true
require_estimate_effort_to_review = false
num_max_findings = 5
extra_instructions = """You are reviewing a KoraLink PR (NestJS+Drizzle API, Next.js PWA/Admin).
Output AT MOST 5 findings, each exactly one line:
SEVERITY(CRITICAL|IMPORTANT|MINOR): file:line — one-sentence issue.
Order CRITICAL first. No praise, no summaries, no restating the diff.
Check: tenant isolation, unguarded mutations, eq(col,null), ::uuid casts,
hydration safety, i18n (ar/en) parity, missing auth guards."""
```

**Machine-readable shape guarantee:** every finding line matches
`^(CRITICAL|IMPORTANT|MINOR): [^:]+:\d+ — `. Consumers: `gh pr view <N> --comments | grep -E '^(CRITICAL|IMPORTANT|MINOR):'`.

### Workflow triggers

- `pr-agent.yml`: `pull_request` (opened + synchronize) on **staging only** — max one
  re-review per push, no comment spam (`handle` job conditions).
- `semgrep.yml`: `pull_request` + `push` to staging; uploads JSON artifact
  `semgrep-report.json` (agent-consumable) and PR annotation summary.
- Neither runs on `main` (release-only; release-verify.yml untouched).

### Secrets

`ZAI_PR_REVIEW_KEY` — a **separate** Lite-plan API key (not the factory key), scoped to the
plan, minted by the OWNER in the z.ai dashboard, stored as a repo Actions secret.
(Owner step T1 — nothing else needs credentials.)

### Verification (Gate 4 done-when)

1. Demo PR on staging → bot comment appears in the exact contract shape (regex above).
2. An agent (subagent or `gh`+grep) extracts ≥1 finding line without human parsing.
3. Semgrep run green (exit 0), JSON artifact attached, custom rules fire on planted test case.
4. `turbo run build` + vitest green on the branch (docs + CI files only — but gate runs anyway).
5. Rollback = disable the two workflow files. No schema, no migrations, no app code touched.

### Cost guardrails baked in

- Re-review capped (opened + synchronize, single handle pass).
- Off-peak scheduling irrelevant (event-driven), but peak PRs cost ≤12 cr — immaterial.
- If weekly bucket >75% at PR-open time: Action still runs (429 → no comment) — factory
  failover is unaffected because the review path is not on any boot path.

## Slices (Gate 4 order)

| # | Slice | Files |
|---|---|---|
| S1 | Output contract + PR-Agent workflow | `.pr_agent.toml`, `.github/workflows/pr-agent.yml` |
| S2 | Semgrep CI + 3 custom rules | `.github/workflows/semgrep.yml`, `.semgrep/koralink-rules.yml` |
| S3 | Demo PR + agent parse test (evidence) | demo branch, this file's Done-when checklist |

**Owner steps (blocked-on-owner):** T1 mint `ZAI_PR_REVIEW_KEY` + add as Actions secret;
T2 approve this spec for Gate 4.
