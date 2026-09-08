# Promote Flow — staging → main (PRODUCTION RELEASE)

> Tier **T2** under `devops-cycle` §2: needs Abdullah's explicit go on the PR.
> `main` push = Render + Vercel ×2 deploy automatically. VPS is untouched.

## Preconditions (all T0-verifiable)

- [ ] `kanban/LOCK.json` absent (no factory run mid-flight)
- [ ] staging deploy green: `bash scripts/deploy-staging.sh` exit 0, matrix H1/H2/H3/H5/H6 ok
- [ ] working tree committed and pushed on `staging` (`git status` clean of YOUR work)
- [ ] CI green on the PR (ci.yml builds + type-checks)
- [ ] If migrations ship in this promotion: staging DB has them journaled AND the prod
      migration runbook (`prod-migrations.md`) has been EXECUTED on Neon BEFORE the merge

## Promote steps (agent does 1–4; step 5 is Abdullah's)

```bash
cd /home/ubuntu/projects/koralink
git checkout main && git pull --ff-only
git merge --no-ff staging -m "chore(release): promote staging to main"   # or gh pr create staging
git push origin main          # ← production release trigger
git checkout staging          # return to the working branch
```

Preferred: `gh pr create --base main --head staging` and merge via the PR (CI gates it).

## Post-release verification (cutover matrix, devops-cycle §6)

1. Render deploy for the new SHA reaches `live`: check via Render API `/v1/services/srv-dadabif10e5c73e207bg/deploys`.
2. `curl https://koralink-api.onrender.com/api/v1/health` → 200 (allow ~60s cold start).
3. Vercel: both team projects show READY for the new SHA (`vercel ls kora-link-player-pwa`).
4. Chunk-grep the prod bundles: API origin = `koralink-api.onrender.com`; dev-login markers
   ABSENT (`NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true` baked).
5. CORS preflight from a Vercel origin → allowed; from staging origin → rejected (Contract 4, C3/C4).
6. Sentry: new release visible, `environment=production`.
7. Append ops-log entry (T2) with the SHA + matrix result.

## Rollback

- Frontends: Vercel dashboard → Deployments → previous → "Promote to Production" (or
  `vercel rollback <url>`).
- API: Render dashboard → Deploys → previous live deploy → Rollback.
- Code: `git revert` on main + push (only if rollback-by-deploy is insufficient).
