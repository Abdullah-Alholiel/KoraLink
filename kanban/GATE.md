# KoraLink Merge Gate — tier path list (Rule 3, D-20261122-02)

Merges to **staging** are tier-gated by path. Promotion to **main** and all production
actions stay owner-only (D-20261113-28: owner go + AI executes; irreversible register
unchanged). A PR is graded by its MOST-TIERED touched path — **when a path matches two
tiers, the HIGHER tier wins** (e.g. a `.spec.ts` under an auth dir grades C, not A).
Before writing an owner question, name its kind (Rule 1, see the factory-loop skill section).

| Tier | Paths (git pathspec, matched from repo root) | Merge needs |
|---|---|---|
| **A** | `docs/**` except `docs/skills/**` and `docs/legal/**` · `kanban/BOARD.md` · `kanban/RUNS/**` · `kanban/STATE.json` · `kanban/OWNER-QUEUE.md` · `apps/api/src/**/*.spec.ts` NOT under a tier-C dir · `apps/player-pwa/test/**` · `apps/player-pwa/src/**/*.test.*` · `apps/admin/**/*.spec.*` | green checks |
| **B** | everything not listed in A or C (application code: API services/controllers/DTOs, PWA src, admin src, non-deploy scripts) | green checks + **a reviewer on a different model than the builder** |
| **C** | `apps/api/drizzle/**` (migrations + journal + snapshots) · `apps/api/src/database/**` (schema) · `apps/api/drizzle.config.ts` · `apps/api/src/modules/auth/**` · `apps/api/src/common/guards/**` · `apps/api/src/common/captcha/**` · `apps/api/src/common/security/**` · `apps/api/src/modules/wallet/**` · `apps/api/src/modules/admin/**` (refunds/settlements/disputes = money + privilege) · `apps/api/src/modules/partner/**` (payouts/settlement revenue) · `apps/api/src/common/moyasar/**` · `apps/api/src/main.ts` (rawBody/helmet/CORS/trust-proxy) · `apps/api/scripts/**` · `**/.env*` + `.deploy-tokens` + any secrets/env file · `.github/workflows/**` · `.github/PULL_REQUEST_TEMPLATE.md` · `.pr_agent.toml` · `.semgrep/**` · `**/Dockerfile*` · `docker-compose*` · `apps/*/deploy/**` (systemd units) · `scripts/deploy-*` · `scripts/migrate-*` · `scripts/release-verify.sh` · `scripts/db-backup.sh` · `scripts/db-backup-prod.sh` · `scripts/check-migration-journal.mjs` · `scripts/neon_*.py` · `scripts/prod-repair-*` · `scripts/start.sh` · `scripts/uptime-watchdog.sh` · `package.json` · `package-lock.json` (supply chain) · `turbo.json` · `apps/*/next.config.mjs` (CSP) · `apps/player-pwa/src/middleware.ts` (auth redirects) · `AGENTS.md` · `.hermes.md` · `docs/skills/**` (agent rule files) · `kanban/DECISIONS.md` · `kanban/GATE.md` · `kanban/DELEGATION.md` · `docs/legal/**` | all of B, **plus a rollback line in the PR**, plus a run-report line under "Tier C merged" |

**Rule-file owner gate:** any edit to `kanban/GATE.md`, `kanban/DECISIONS.md`, or
`kanban/DELEGATION.md` additionally needs an explicit owner go in chat (these files change
the factory's own rules — a cross-model reviewer alone is not sufficient). Routing a run's
routine report/ledger append through those files is exempt; CHANGES to their rules are not.

**Automatic escalations (any PR):**
- An added line containing a secret-like string (`sk_`/`key=`/`token=`/`password=` patterns,
  `-----BEGIN`, `Bearer `, `postgres(ql)://` URIs), `sudo`, `curl | sh`, or `0.0.0.0`
  (listening-host guard; may false-positive on docs prose — reviewer notes it) → tier C.
- Legal-copy edits inside `apps/player-pwa/src/messages/{en,ar}.json` (the `legal`
  namespace) are tier C **by discipline** even though the path grades B — the files
  cannot be path-split by namespace; reviewers must check the diff for `legal.`
  keys and grade accordingly.
- PR >500 changed lines → split, or add a second reviewer.
- PR >1,000 changed lines → listed for the owner in the run report.

**Reviewer-model rule (tier B):** the builder is the session model (currently
`glm-5.3-flash` via zai). The ONE accepted different-model lane for factory-built code is
the **tier-2 `claude -p` pass or a zeroshot (Claude) lane review** — PR-Agent's zai GLM
review and the in-run Reviewer A/B dispatch (glm-5.3-flash) are SAME-model-family and do
NOT satisfy tier B when the builder is glm-5.3-flash. (When CI's PR-Agent is the only
review on a tier-B PR built by glm, the run must add a `claude -p` verdict before merge.)

**Rollback-line template (tier C PRs):**
> Rollback: `git revert <merge-sha>` on staging → rebuild → `systemctl --user restart
> <affected services>` — or "N/A, no runtime surface" for docs/CI-only tier-C PRs.
> If a migration rode the merge: migrations are applied out-of-band via
> `MIGRATE_DATABASE_URL=... node scripts/migrate-vps.mjs` — reverting the code does NOT
> roll back the DB; state the DB impact explicitly here and reference the pre-migration
> backup (fresh `scripts/db-backup-prod.sh` dump) taken before applying.

Adopted: 2026-11-22 (D-20261122-02, owner: "Adopt all three"). **Path list corrected and
ACTIVATED 2026-11-23 per the Claude Opus 5.5 review (run #224, verdict
ACTIVATE-WITH-FIXES — all CRITICAL/IMPORTANT path fixes applied; verdict archived in
kanban/RUNS/2026-11-23T01-17Z-run224.md).** Rollback of the RULES themselves: delete this
file + kanban/DELEGATION.md + the skill section (see the decision's "Roll back" note).
