# KoraLink CI/CD — branch model, gates, and releases

## Branch model (short version)

| Branch | Role | Deploys to |
|---|---|---|
| `staging` | ALL day-to-day work (factory cron, agents) | VPS quartet via `scripts/deploy-staging.sh` (push-triggered for agents; script is canonical) |
| `main` | **RELEASE-ONLY** — reached via PR `staging → main` | Push = production release: Render API + Vercel PWA + Vercel Admin rebuild automatically |

Never push to `main` directly. A push **is** a release.

## The workflows

### `pr-gate.yml` — runs on every PR (and every push to `staging`)
1. `npm ci`
2. Lint (report-only in v1)
3. `tsc --noEmit` on API and PWA (**hard**)
4. Jest (API) + Vitest (PWA) (**hard**)
5. `turbo run build` — all three apps (**hard**)
6. `node scripts/check-migration-journal.mjs` — every `00NN_*.sql` must have a
   `_journal.json` entry and vice-versa (kills the run-#39 / 0014-collision drift class)
7. `fresh-apply` job — applies **every** migration to a scratch
   `imresamu/postgis:16-3.5` using the real applier, then re-runs it and
   **requires `0 applied`** (idempotency proof). A migration that cannot apply
   from zero never reaches staging or Neon.

### `release-verify.yml` — runs after every push to `main`
Waits ~7 min for Render/Vercel builds, then runs
`scripts/release-verify.sh` (public cutover matrix: API health, PWA/Admin
reachability, no dev-login markers in the prod bundle, CORS must not echo
foreign origins) and stamps the result on the commit as
`release-verify/prod`.

## How to release (staging → production)

1. Work lands on `staging` (factory runs do this automatically). Staging is
   always the FIRST test environment: builds + tests + health matrix + E2E
   run there via `scripts/deploy-staging.sh` — **before** any PR exists.
2. Open the PR: `gh pr create --base main --head staging` (one PR per release;
   close and reopen a fresh one rather than recycling).
3. Watch CI on the PR (`gh pr checks`). All gates must be green.
4. Review the diff (`gh pr diff`) — this is the last human look at exactly
   what will hit production.
5. Merge (`gh pr merge --squash --delete-branch=false`). Render + Vercel×2
   auto-deploy. `release-verify.yml` then stamps the commit green/red.

## How to test a PR (Abdullah's question, answered)

- **Functional testing happens on STAGING, before the PR**: if it works on
  `https://aa.tail2948f9.ts.net:9450`, you have already tested the code the
  PR contains — the PR is the same commit.
- **The PR itself adds machine verification**: CI re-runs lint/typecheck/
  tests/build/migration-fresh-apply on GitHub's clean runners — catching
  "works on my machine" issues and schema drift before merge.
- After merge, production IS the test surface of last resort:
  `release-verify.yml` + the manual cutover matrix.

## One-time manual step (Abdullah, in GitHub UI)

Settings → Branches → Add branch protection rule for `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks: `gate`, `fresh-apply` (from pr-gate.yml)
- ✅ Do not allow bypassing the above settings (even for admins)

## Local equivalents

```bash
node scripts/check-migration-journal.mjs                     # journal drift
bash scripts/release-verify.sh https://koralink-api.onrender.com/api/v1 \
  https://kora-link-player-pwa.vercel.app https://kora-link-admin.vercel.app
```
