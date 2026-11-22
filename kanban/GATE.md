# KoraLink Merge Gate — tier path list (Rule 3, D-20261122-02)

Merges to **staging** are tier-gated by path. Promotion to **main** and all production
actions stay owner-only (D-20261113-28: owner go + AI executes; irreversible register
unchanged). A PR is graded by its MOST-TIERED touched path. Before writing an owner
question, name its kind (Rule 1, see the factory-loop skill section).

| Tier | Paths (git pathspec, matched from repo root) | Merge needs |
|---|---|---|
| **A** | `docs/**` · `kanban/BOARD.md` · `kanban/RUNS/**` · `kanban/STATE.json` · `kanban/OWNER-QUEUE.md` · `**/*.md` outside C · `apps/api/src/**/*.spec.ts` · `apps/player-pwa/test/**` · `apps/player-pwa/src/**/*.test.*` · `apps/admin/**/*.spec.*` · test fixtures/helpers | green checks |
| **B** | everything not listed in A or C (application code: API services/controllers/DTOs, PWA src, admin src, non-deploy scripts) | green checks + **a reviewer on a different model than the builder** |
| **C** | `apps/api/drizzle/**` (migrations + journal + snapshots) · `apps/api/src/database/**` (schema) · `apps/api/src/modules/auth/**` · `apps/api/src/common/guards/**` · `apps/api/src/common/captcha/**` (auth-adjacent) · `apps/api/src/modules/wallet/**` · `apps/api/src/common/moyasar/**` (payments) · `**/.env*` + `.deploy-tokens` + any secrets/env file · `.github/workflows/**` · `**/Dockerfile*` · `docker-compose*` · `scripts/deploy-*` · `scripts/migrate-*` · `scripts/release-verify.sh` · `scripts/db-backup-*` · `scripts/factory-watchdog.sh` · `scripts/koralink-gateway-guard.sh` · `kanban/DECISIONS.md` · `kanban/GATE.md` · `kanban/DELEGATION.md` · `docs/legal/**` | all of B, **plus a rollback line in the PR**, plus a run-report line under "Tier C merged" |

**Automatic escalations (any PR):**
- An added line containing a secret-like string (`sk_`/`key=`/`token=` patterns), `sudo`,
  `curl | sh`, or `0.0.0.0` → tier C.
- Legal-copy edits inside `apps/player-pwa/src/messages/{en,ar}.json` (the `legal`
  namespace) are tier C **by discipline** even though the path grades B — the files
  cannot be path-split by namespace; reviewers must check the diff for `legal.`
  keys and grade accordingly.
- PR >500 changed lines → split, or add a second reviewer.
- PR >1,000 changed lines → listed for the owner in the run report.

**Reviewer-model rule (tier B):** the builder is the session model (currently
`glm-5.3-flash` via zai); the different-model reviewer is PR-Agent (zai GLM on the CI
side counts as same-family — so tier B ALSO needs the in-run delegated reviewer or a
`claude -p` pass when PR-Agent's verdict is the only review). Factory runs satisfy this
with the standing Reviewer A/B dispatch (glm-5.3-flash reviewers reviewing parent-built
code do NOT satisfy different-model — the parent IS glm-5.3-flash; use the zeroshot
Claude lane or `claude -p` for tier-B review when no CI cross-model reviewer fires).

**Rollback-line template (tier C PRs):**
> Rollback: `git revert <merge-sha>` on staging → rebuild → `systemctl --user restart
> <affected services>`. If a migration rode the merge: migrations are applied
> out-of-band via `MIGRATE_DATABASE_URL=... node scripts/migrate-vps.mjs` — reverting
> the code does NOT roll back the DB; state the DB impact explicitly here.

Adopted: 2026-11-22 (D-20261122-02, owner: "Adopt all three"). First effective after the
Claude path-list review recorded in kanban/RUNS (run #223). Rollback of the RULES
themselves: delete this file + kanban/DELEGATION.md + the skill section (see the
decision's "Roll back" note).
