## What this PR carries
<!-- One paragraph: what changes and why. -->

## Reviewer instruction (AI review = PR-Agent + Semgrep)
Produce a **summary + explicit verdict**: merge-worthy or not, and whether anything
is missing for optimal implementation. Code-level readiness is the AI review's call.
Design and functional testing are done by the owner separately.

## Gate evidence
<!-- For code PRs: local gates already run before opening. Promote PRs: CI results land in checks. -->
- [ ] PWA vitest: `cd apps/player-pwa && npx vitest run` — all passed
- [ ] Type-check clean
- [ ] `npx turbo run build --concurrency=1` — 3/3 successful

## Merge checklist
- [ ] PR Gate green
- [ ] Semgrep: findings in touched files = 0 (or justified)
- [ ] GLM review verdict: approve (or follow-ups resolved)
- [ ] Owner design/functional pass done
