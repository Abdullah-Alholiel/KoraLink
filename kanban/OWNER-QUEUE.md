# KoraLink Owner Decision Queue

## Snapshot
- Open PRs: 0 — run #232 MERGED **PR #301 `5e6ea9ce`** (P2-383 stable error codes: PWA EmailSection status-first + admin disputes stable codes + mailer EMAIL_TAKEN object form; PR-Agent r1/r2 MINORs fixed same-PR, r3 clean; LIVE on staging — all 3 services restarted, health 200). Run #231 merged PR #299 `3d3e2fe2` (P2-401) + PR #300 `dacd687d` (P2-402).
- **🔴 URGENT (owner: `irreversible` kind): Neon quota STILL DEAD — run #232 (2026-11-26 02:0xZ): 1C 96 events/24h (rising), nightly backup ~142h stale (newest good dump Nov 20 03:23Z — watchdog §4b red). Per YOUR decision D-20261122-01 the heal path is the COOLIFY CUTOVER + Nov-20-backup restore (NOT a Neon payment) — it needs a fresh supervised window from you. Until then prod writes fail near-continuously and backups stay stale.**
- **⚠ URGENT: PROD API IS STALE — Render serves the SEP-25 build; the promote package lane is BLOCKED (migrate-first precondition needs the prod DB alive; Neon refuses connections). The ONLY heal is the Coolify cutover (D-20261122-01, owner `irreversible`). Cutover docs are now FRESH for your session: prod-on-vps.md image = PG17 (`imresamu/postgis:17-3.5`, registry-verified), restore = `psql -v ON_ERROR_STOP=1` + 32-table check, journal 60→migrate 0059–0061→62 before traffic (A4). New skill `koralink-cutover-runbook` lets a Claude session drive A2–A5 prep.**
- Promote gap: 51 commits ahead of main (incl. #299/#300/#301); last promote 2026-11-18 (#276 — its Render deploy crashed, P0-12). A Neon-first promote is BLOCKED until the cutover restores a live prod DB.
- Services: API :3001 healthy, PWA :3000 + admin :3002 active on `5e6ea9ce`. Tailscale funnels :9450/:8443 still DOWN (owner re-auth pending).
- **DONE (#231): D-20261125-01 (launch-first rule in cron prompt + SKILL.md v1.5.4 + STATE consistency) and D-20261125-02 (PG17 image, strict restore, 60→62 journal gates, watchdog §8b wired) — executed + ledger-logged; removed from the waiting list.**
- Owner decisions waiting: NEW-10 (F9 repo + age-key escrow — watchdog §8b auto-arms the moment GH_BACKUP_REPO is real). Standing below re-labeled per Rule 1 (D-20261122-02).


## Active owner actions

### NEW-10. F9 — Create the private offsite backup repo + escrow the age key (NEW run #227)
- **What:** The offsite backup pipeline is BUILT and verified (run #227: age-encrypt → decrypt round-trip → canary restore 32 tables OK; push fails loud until the repo exists). Two owner steps remain: (1) create a PRIVATE GitHub repo for backups (suggested name `koralink-backups`, empty, private) — the factory PAT already has Contents:write so NO deploy key is needed; (2) escrow the age PRIVATE key `~/.config/koralink/koralink-offsite.key` somewhere OFF this VPS (password manager / printed) — losing it loses every backup.
- **Close line:** "F9 repo created <owner/repo>" → factory sets `GH_BACKUP_REPO` in offsite.env and re-runs the push to confirm end-to-end (remote-blob decrypt verification included).
- **Deadline:** Before launch (launch condition 5 needs a tested offsite restore; local restore-test already PASSES).

### NEW-9. F1 — Arm Cloudflare Turnstile on staging (NEW run #212)
- **What:** F1 OTP bot protection is built and LIVE, but flag-off by default (`TURNSTILE_ENABLED=false`). The PWA only renders the widget when `/api/v1/health` advertises a site key. Cloudflare dummy keys exist for CI/staging short-circuit; real keys are needed for actual protection.
- **Your part:** Cloudflare dashboard → Turnstile → create widget for `aa.tail2948f9.ts.net:10000` and `koralink.app` (or the live domains) → copy **site key** + **secret key** into the staging API env (`apps/api/.env`): `TURNSTILE_SITE_KEY=...`, `TURNSTILE_SECRET_KEY=...`, then `TURNSTILE_ENABLED=true`. Restart API.
- **Verify:** `/api/v1/health` returns `turnstile.enabled=true` and a siteKey; `/ar/login` renders the widget; a fake token fails with `CAPTCHA_INVALID`; a missing token fails with `CAPTCHA_REQUIRED`.
- **Close line:** "F1: Turnstile armed on staging" — or report any blocker.
- **Deadline:** Before A6 public go-live (launch-lane precondition).

### NEW-8. P1-66 — 2-minute browser subscribe test (NEW run #203)
- **What:** VAPID keys are now generated + live (your D-20261106-15 decision, executed run #203). Server pushes are ENABLED and the PWA bundle carries the public key. Push needs one human test on a real device to close.
- **Your part:** Open the PWA on your phone → PROFILE → enable push → accept the permission prompt → confirm the bell/subscription state.
- **Close line:** "P1-66: subscribe test passed" (factory then records the ledger close) — or report what failed.
- **Deadline:** Before public launch.

### NEW-1. P2-325 — Moyasar webhook registration (UPDATED run #223 — the endpoint is BUILT)
- **What:** The F2 webhook endpoint is LIVE on staging flag-off (PR #288): Moyasar can push payment events the moment a top-up completes — closes the newest-100 reconcile gap. **Your part shrank to 4 steps, IN THIS ORDER** (the verification event is one-time; the endpoint must accept deliveries first):
  1. `openssl rand -hex 32` → paste as `MOYASAR_WEBHOOK_SECRET` in the API env.
  2. Flip `WALLET_WEBHOOK_ENABLED=true` → restart API.
  3. Moyasar dashboard → Settings → Webhooks → register the URL with that same secret as the shared secret.
  4. Read the 6-digit code from the API log / Sentry page → confirm the webhook in the dashboard within 30 min (dashboard can resend the code).
- **Close line:** "P2-325: webhook registered + code confirmed" — factory then verifies on staging E2E.
- **Deadline:** Before prod launch (money-adjacent; pairs with OWNER-QUEUE 4 sandbox test).

### NEW-2. P2-327 — admin console MFA (NEW run #196, follows RBAC)
- **What:** The admin console (settlements void/pay, refunds, CSV exports) sits behind password-only auth; no 2FA anywhere. Per D-20261106-14 RBAC design comes first; MFA is the follows-item.
- **Close line:** "P2-327: plan MFA after RBAC" OR "P2-327: not needed (VPS-private console)".
- **Deadline:** Before staff accounts exist.

### NEW-3. P2-328 — promo/coupon system shape (NEW run #196, CEO-lane)
- **What:** No discount codes exist (grep 0 hits); competitors run first-game discounts heavily in KSA. Needs product shape: % vs flat, per-venue vs platform, stacking rules.
- **Close line:** "P2-328: build <shape>" OR "P2-328: defer post-launch".
- **Deadline:** None (acquisition lever, not a gap).

### NEW-6. P2-334 — blackout product shape: soft-record vs snapshot-restore (NEW run #198)
- **What:** Pitch blackouts DELETE every free slot in the range with no list/undo — a partner who fat-fingers a date range cannot recover availability without manually re-adding slots (admin surface omits it too). Before the factory builds a blackout list/restore surface, the product shape needs your call.
- **Your part:** Choose: (a) blackouts become durable records (list + delete = restore slots), or (b) keep delete-but add a pre-delete preview + short undo window, or (c) both.
- **Close line:** "P2-334: durable blackout records + restore" OR "P2-334: preview + undo window" OR "P2-334: both" OR "P2-334: defer".
- **Deadline:** Before partner portals onboard real venues.

### 1. P0-11 — Coolify cutover go/no-go (NEW run #190 — the plan is ready)
- **Owner decision (Life OS 2026-11-07, D-20261106-01):** Approve plan, start A2
- **What:** Move prod+staging onto this VPS via Coolify (PDPL residency). The full plan is at **docs/plans/prod-on-vps.md** — verified against live reality: Coolify 4.6.0 + Traefik proxy are ALREADY installed and healthy on this VPS; the three app Dockerfiles + standalone outputs exist; zero port conflicts; staging quartet stays untouched. Eight numbered approvals (A1 plan → A2 create apps+prod-DB → A3 webhook → A4 Neon→VPS DB move (owner-executed) → A5 sslip URLs → A6 public go-live → A7 offsite backup target → A8 retire Render/Vercel/Neon after 2 stable weeks). Prod DB = memory-capped container, credentials owner-held, factory never sees them. Launch gaps listed not built (Turnstile on OTP, PDPL notice, Moyasar/Unifonic callbacks, offsite backup NOT R2).
- **Close line:** "P0-11: plan approved, start A2" OR "P0-11: amend — <notes>" OR "P0-11: defer".
- **Deadline:** Owner-paced; nothing executes without your A1.

### 2. Next promote staging→main — ⚠ URGENT: this also HEALS PROD (run #216)
- **Owner decision (Life OS 2026-11-22, D-20261119-01):** do it
- **Owner decision (Life OS 2026-11-07, D-20261106-02 + chat 2026-11-13, D-20261113-28):** owner checks UI/UX on staging and says GO in chat; the AI then executes migrate-first + the merge + deploy, and reports back.
- **NEW run #216 (2026-11-19): the promote is no longer routine — it is the PROD HEAL.** Promote #276's Render deploy CRASHED at boot (Render logs: `Storage env incomplete: S3_* are required` — StorageModule boot throw; SeaweedFS is staging-only). Render rolled back to the Sep-25 build: **prod API has missed every release since Sep 25** while Vercel PWA+admin deployed new (players' apps now call endpoints prod doesn't have: receipts, waitlist chips, bell pagination, coded topup errors). Fix PR #277 is MERGED to staging; one owner "GO" triggers: assemble promote PR → verify Neon 62==62 (no migrations pending) → merge → Render deploys a post-fix SHA (boots clean without S3_*) → verify Render `live` + prod health `turnstile` block.
- **Your one word:** "GO" in chat (after your own staging check).
- **Optional hardening:** Render dashboard → koralink-api → Settings → Pre-Deploy Command `node scripts/migrate-vps.mjs` (closes P2-51 drift permanently).
- **Neon housekeeping (optional, 10 min):** check koralink-prod Usage/plan; delete `koralink-prod-pg18-empty` experiment. Nightly prod dumps LIVE (koralink-backup-prod.timer 03:20 UTC, 30-day retention) + watchdog freshness alarm covers prod.

### 6. P1-45 admin push composer — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-07, D-20261106-06):** Admin plus venue-owner scoped.
- **Nothing to ask.** The build slice carries this decision as given. CLOSED 2026-11-22.

### 7. P2-297 — hidden review rating policy — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-07, D-20261106-07):** Hidden reviews still count.
- **Nothing to ask.** The question duplicate is removed; the build-side slice (rating recompute) takes the decision as given. CLOSED 2026-11-22.

### 8. P1-69 player wallet withdrawal — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-08, D-20261106-08):** Defer until post-launch — back in the wallet, not to their bank.
- **Nothing to ask.** CLOSED 2026-11-22 (re-open only if the owner revisits the rail choice).

### 9. P1-73 — dev-login on staging — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-07, D-20261106-09):** Keep dev-login on staging.
- **Nothing to ask.** Factory re-assessed as ACCEPTED-RISK run #193; the DEV_LOGIN_ENABLED prod boot guard (PR #286) protects prod. CLOSED 2026-11-22.

### 10. Recurring-match series identity — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-08, D-20261106-11):** Confirmed: independent matches; owner re-review only if a series feature is proposed.
- **Nothing to ask.** CLOSED 2026-11-22.

### 12. P1-76 — social sign-in — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-07, D-20261106-12):** Build Apple first post-launch.
- **Nothing to ask.** CLOSED 2026-11-22 (post-launch milestone).

### 13. P2-311 — receipt/invoice shape — DECIDED, CLOSED (run #223 Rule-1 sweep)
- **Owner decision (Life OS 2026-11-07, D-20261106-13):** In-app receipt MVP + exportable as invoice.
- **Nothing to ask.** Receipt MVP SHIPPED (PR #256); invoice export rides P2-145. CLOSED 2026-11-22.

### 4. P0-2 sandbox → live Moyasar (kind: `promise` — credentials/live money)
- **Owner decision (Life OS 2026-11-07, D-20261106-04):** Flip WALLET_TOPUP_ENABLED and test.
- **What:** Flip `WALLET_TOPUP_ENABLED=true` + real Moyasar sandbox keys on staging; run one SAR 5.00 top-up with test card 4201320111111010. The F2 webhook (PR #288) is now live flag-off — a full E2E can include webhook-delivery credit once NEW-1 is done.
- **Close line:** "P0-2 sandbox tested".
- **Deadline:** Before prod launch.

### 5. P1-41 email live (kind: `promise` — provider keys)
- **Owner decision (Life OS 2026-11-07, D-20261106-05):** Defer to pre-launch — check before launch.
- **Close line:** "Email live: keys verified".
- **Deadline:** Before prod launch.

### 11. P1-72 staging posture — CLOSED by factory run #209 (verify-only)
- **Owner decision (Life OS 2026-11-07, D-20261106-10):** Apply posture — flags were ALREADY SET in apps/api/.env (COOKIE_SECURE=true, SWAGGER_ENABLED=false; DEV_LOGIN_ENABLED untouched per owner) and the API has been serving them. Run #209 executed the REQUESTED VERIFICATION (D-20261113-08 proof): GET /api/docs → **404**, dev-login Set-Cookie → **HttpOnly; Secure; SameSite=Lax**, /health 200. No env change was needed; Strix MEDIUM is closed on staging evidence.
- **Closed:** 2026-11-15 (run #209). Ledger row added to kanban/DECISIONS.md.

## Owner decisions from Life OS

- **Owner decision (Life OS 2026-11-07, D-20261106-14):** Design RBAC before adding staff roles
- **Owner decision (Life OS 2026-11-07, D-20261106-15):** Generate and set VAPID keys
- **Owner decision (Life OS 2026-11-08, D-20261106-11):** Confirmed: independent — Review and assess situation fully and re assess recomended decision depending on my app !

### NEW-7. P2-345 — waitlist cap / anti-flood product shape (NEW run #200)
- **What:** Waitlist queue on a popular paid match is unbounded — push fan-out and notification noise grow with queue length. Options: hard cap N (suggest 20), auto-close queue at N, or accept as-is.
- **Close line:** "P2-345: cap at 20" OR "P2-345: auto-close at N" OR "P2-345: accept unlimited".
- **Deadline:** Not urgent; matters most for popular venue-flagship matches.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-13, D-20261113-08):** Owner decided Apply posture on 2026-11-07. In staging apps/api/.env set COOKIE_SECURE=true and SWAGGER_ENABLED=false (flags from PR #216, 6eb11db), restart the API, then report back: /health 200, Swagger route 404, Set-Cookie carries Secure. Do not touch DEV_LOGIN_ENABLED (owner kept it on). No secrets in the report. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-13, D-20261113-09):** Restore the latest nightly prod dump (koralink-backup-prod, 03:20 UTC) into a throwaway scratch Postgres container on the VPS, never prod or staging. Check journal rows (expect 60) and row counts of users, matches, wallet tables. Write the steps as docs/runbooks/restore-drill.md and report timing and result. Offsite target stays an owner step (A7). — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-13, D-20261113-26):** Patch the factory loop skill and the cron prompt (back up both first, report the diff): (1) before picking board rows, read ~/projects/life-os/readiness/koralink-production-plan.md Step 3 lane (a) and take the next unbuilt item on the critical path (F1 to F10); polish or cosmetic rows only when no launch item is buildable; (2) treat kanban/DECISIONS.md rows marked 'Life OS WORKER request' as buildable work and report the proof they ask for; never do owner-only actions; (3) fix prompt drift: it says 5-hourly and branch main, the loop runs twice a day on staging; (4) first: expand /privacy and /terms to full PDPL-structured EN+AR drafts marked 'draft pending lawyer' (the privacy page is a 4-heading placeholder), so the lawyer can start. Report back: diff summary, the run that first used the launch lane, PR numbers. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Owner decision (Life OS 2026-11-13, D-20261113-03):** Launch with Moyasar sandbox only; real money comes later, after everything is tested — Owner said in chat 2026-11-13: test with the Moyasar sandbox until production is tested and ready for real money. Company registration and live keys are NOT on the launch path; track them as a separate later milestone.
- **Owner decision (Life OS 2026-11-13, D-20261113-28):** Owner checks UI/UX and user functions on staging and says go; Claude reviews the change summary; Hermes merges and deploys; a summary goes to the owner — Said in chat 2026-11-13. No branch rules wanted. Money rules, destructive database changes and credentials stay with the owner. Replaces the 2026-11-03 'promote merge is owner-only' rule: the owner's go is still required, the merge itself is done by the AI.
- **Owner decision (Life OS 2026-11-13, D-20261113-31):** Add it to the board for the loop: assess and specify first, then build in slices after the launch-critical items. Tokens only, never card numbers. Board task t_297ad385 — Said in chat 2026-11-13
- **Owner decision (Life OS 2026-11-13, D-20261113-32):** Do right after the top-up form fix, before cosmetic rows. Brief: ~/projects/life-os/dispatch/koralink-ui-defects-brief.md Part 1 — Said in chat 2026-11-13
- **Owner decision (Life OS 2026-11-13, D-20261113-33):** Build the audit, run a baseline over all main screens, update the UI standards skills so no UI slice closes without it. Brief: same file, Part 2 — Said in chat 2026-11-13
- **Owner decision (Life OS 2026-11-13, D-20261113-40):** Fix the one line (recommended) — Owner said yes in chat 2026-11-13 (VPS session). Low priority: stopgap is live, nothing is broken now.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-14, D-20261114-01):** Write docs/legal/lawyer-brief.md for the Saudi lawyer: entity name and CR number still missing (D-20261113-03), processors list (Moyasar, Unifonic, Sentry, PostHog, Brevo/Resend, hosting), SAR 5 per-joiner fee, 30-day backup retention, and open questions (stored-value wallet and SAMA, VAT/ZATCA invoice for the fee, PDPL transfers). List claims in en.json that are false today, e.g. line 1167 'hosting inside the Kingdom' while prod is still Render/Vercel/Neon, and line 1175 cookies text vs PostHog. Add a TODO-lawyer marker beside each. No legal conclusions. Report back the PR and the file. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-14, D-20261114-02):** mailer.service.ts:66-67 reads only RESEND_API_KEY, so notification email is log-only on staging while OTP email already works via Brevo. Route MailerService through the existing email-sender port so Brevo covers notification mail too. No new dependency, no secrets in the report. Proof: PR number, a unit test, and one staging log line showing the Brevo send path chosen. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- ✅ **DONE (run #213 + verified #214) — D-20261117-03:** A2 env checklist in prod-on-vps.md landed with run #213's docs commit (84d99af); all requested env names present in-tree. No owner action needed.
- ✅ **DONE (run #213 PR #271 + verified #214) — D-20261117-04:** Turnstile prod dummy-secret guard + config hygiene merged and LIVE. No owner action needed.
- ✅ **DONE (run #215, PR #266 SQUASH-MERGED 192a0c0 + CI 8/8 + review CLEAN + image build/boot smoke green) — D-20261118-01:** PR #266 (commits 1a19fe5, 4395501: Node 22, admin start path, NEXT_PUBLIC build args, node:crypto import in handle-suggest.ts) is held and staging Dockerfiles are still node:20-alpine (Dockerfile:2,19; apps/api, admin, player-pwa). Rebase #266 on staging, run the three image builds and boot each container locally, merge through the normal PR-Agent cycle if green, and report PR number, build results and a one-line smoke per image. Do not touch Coolify, prod or the deployment checkout state. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-18, D-20261118-02):** (1) In en.json and ar.json fix the privacy and terms copy found wrong today: line 1189 says accounts need a Saudi phone number (email OTP login exists); lines 1183 and 1160 claim hosting inside the Kingdom (true only after cutover, prod is Render/Vercel/Neon today; reword to be true now or mark it as taking effect at launch); line 1191 says cookie is Secure (true only when COOKIE_SECURE=true). Keep the draft-pending-lawyer markers and i18n parity. (2) Make prod fail loud at boot when EMAIL_PROVIDER is unset or its key is missing (.env.example:45 defaults to resend while staging uses brevo), with a spec. Report PR number and spec output. No secrets. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-19, D-20261119-02):** Build before any P2 polish row. (1) apps/player-pwa/src/messages/en.json and ar.json: fix false copy at lines 1160 and 1183 (hosting in the Kingdom: reword to be true now, or say it takes effect at launch), 1189 AND 1201 (Saudi phone number required: email OTP exists), 1191 (cookie Secure only when COOKIE_SECURE=true). Keep draft-pending-lawyer markers and EN/AR parity. (2) Prod must fail loud at boot when EMAIL_PROVIDER is unset or its key is missing (email-sender.provider.ts:24 defaults to resend; .env.example:45), with a spec. Report PR number and spec output. No secrets. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-19, D-20261119-03):** Fix scripts/release-verify.sh (lines 16-21 only check HTTP 200) and .github/workflows/release-verify.yml (:28 sleeps 420s, probes hardcoded onrender.com/vercel.app). Make the script compare the API /health build SHA (or presence of the turnstile block) with the pushed commit SHA and FAIL on mismatch; take the API base URL as a parameter so it can be re-pointed to Coolify at cutover. Add a post-promote deploy check step to the factory-loop promote-health section. Report PR number and a run against current prod showing it fails on the stale Sep-25 build. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-20, D-20261120-01):** Rewrite readiness/koralink-production-plan.md to today: mark done F-items with PR proof (#254 legal drafts, #258 mailer, #266 Node 22, #277 storage guard, #279 release-verify SHA, #283 legal truth-fix + email guard), list what is left on the critical path, record that prod API is stale since promote #276, and give a new likely date. Report the file path and the open F-items. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-20, D-20261120-02):** (1) Add docs/plans/cutover-flip-checklist.md listing every string, pin test and setting that must change in the Coolify cutover commit: hosting copy in en.json/ar.json and p218-legal-truth-pins.test.ts, release-verify.yml hosts at lines 33-35, TRUST_PROXY=1, COOKIE_SECURE=true, SWAGGER_ENABLED=false, dev-login off. (2) Update docs/legal/lawyer-brief.md so it matches the copy after PR #283 and lists the claims a lawyer must check: hosting place, 72h breach notice, SDAIA complaint route, host strict-liability text at en.json:427, cross-border transfer, no-show fee still undecided. Report both file paths. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-21, D-20261121-01):** (1) apps/api health.controller.ts:21-23 emits commit only from RENDER_GIT_COMMIT; read RENDER_GIT_COMMIT || SOURCE_COMMIT || GIT_SHA, add ARG GIT_SHA + ENV GIT_SHA in apps/api/Dockerfile, so scripts/release-verify.sh:42-43 passes on Coolify and staging health shows commit. (2) auth.controller.ts:168-170: add a boot refusal in env-flags.ts when DEV_LOGIN_ENABLED=true and NODE_ENV=production, mirroring the COOKIE_SECURE/SWAGGER guard. Add both to docs/plans/cutover-flip-checklist.md. Proof: PR numbers, jest spec names, staging /health showing commit. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-21, D-20261121-02):** Reminder: D-20261120-01 (refresh readiness/koralink-production-plan.md, 8 days old) and D-20261120-02 (docs/plans/cutover-flip-checklist.md + docs/legal/lawyer-brief.md refresh) were committed in run #219 and skipped by run #220, which took P2-371 polish and boarded P2-391/392/393. Take both next run, ahead of any P2 layout or a11y item (P2-391/392/393 wait). Also read the red backup unit koralink-backup-prod in preflight and write it to the run report and OWNER-QUEUE. Proof: both file paths, PR or commit, run report line. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-21, D-20261121-06):** In scripts/db-backup-prod.sh write the dump to $OUT.tmp, run the 3 checks (gzip -t, size>=10000, >=20 CREATE TABLE), mv to final name only on pass, rm tmp via trap on failure, log size. Proof: PR link + a dry run showing a failed run leaves no file. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Owner decision (Life OS 2026-11-22, D-20261113-16):** Yes, Nov 17 to 28
- **Owner decision (Life OS 2026-11-22, D-20261113-14):** Register the webhook, factory builds the verify endpoint
- **Owner decision (Life OS 2026-11-22, D-20261114-03):** Launch = beta with sandbox payments; real money is a later milestone, terms say so
- **Owner decision (Life OS 2026-11-22, D-20261117-06):** Sat 2026-11-21 — Today whenever a good time is
- **Owner decision (Life OS 2026-11-22, D-20261113-10):** Karma penalty plus fee equal to the player share on paid matches
- **Owner decision (Life OS 2026-11-22, D-20261113-11):** Register webhook URL, factory builds signed verify endpoint
- **Owner decision (Life OS 2026-11-22, D-20261113-15):** Private GitHub repo
- **Owner decision (Life OS 2026-11-22, D-20261114-04):** Build a consent banner, then turn PostHog on
- **Owner decision (Life OS 2026-11-22, D-20261115-04):** Host cancel inside 12h forfeits pitch cost to the venue
- **Owner decision (Life OS 2026-11-22, D-20261118-03):** Do it with the Sat 11-21 cutover session — Or today
- **Owner decision (Life OS 2026-11-22, D-20261118-04):** Yes, Claude session patches both with backup
- **Owner decision (Life OS 2026-11-22, D-20261122-01):** Move production to the VPS now: do the planned Coolify cutover (D-20261117-06) and restore the 20 Nov backup; no Neon payment
- **Owner decision (Life OS 2026-11-22, D-20261122-02):** Adopt all three
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-22, D-20261122-04):** SHIPPED 2026-11-23 (run #225, PR #290 squash 719b5f84, MERGED + LIVE on staging; migration 0061 applied): both rules built + specs (matches.money-rules-126.spec 17/17) + terms EN+AR rendered on the Terms page + lawyer-brief §4.1. Owner/counsel items left OPEN: (1) who receives the no-show fee (player-debited only today); (2) platform auto-cancel forfeit residual (host can passively let a booking underfill to capture the auto-cancel refund — policy decision, see brief 'forfeit scope'); (3) unaffordable-fee blocks the whole mark (no debt model). — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-22, D-20261122-05):** Per D-20261113-14/-11 (register webhook, factory builds verify endpoint): add a wallet webhook endpoint now, default OFF behind a flag: raw-body HMAC signature check with constant-time compare, idempotency by payment id, reuse the reconcile credit path (wallet.reconcile.service.ts), specs for bad signature, replay and good payment. Env names in .env.example only, no secrets. Owner then only pastes the URL and secret. Proof: PR number, spec names. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-23, D-20261123-06):** Owner said Yes (Nov 17 to 28): add a 12:15 UTC factory slot. cron/jobs.json KoraLink Factory Loop still has expr '15 1,15 * * *' (2 runs/day, runs #218-#224 confirm). Back up jobs.json, add the 12:15 slot until Nov 28, report the diff and the first run that used it. Also correct the plan's '3 runs/day' sizing. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-23, D-20261123-07):** koralink-factory-loop/SKILL.md still has zero hits for production-plan or 'WORKER request'. Back up, then patch: read readiness/koralink-production-plan.md Step 3 lane (a) before picking rows; treat 'Life OS WORKER request' rows in DECISIONS.md as work; fix '5-hourly'/'branch main' drift. Report diff and commit. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-24, D-20261124-01):** Build the offsite backup step now, no cutover needed: encrypt the newest dump (age), push to a private GitHub repo target per D-20261113-15, script plus a restore check against the 2026-11-20 dump. Do not create the repo or deploy key (owner step); write the exact owner steps in OWNER-QUEUE. Report PR number and restore-check output. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-24, D-20261124-02):** Back up first, then patch: (1) run report line 1 must name the plan F-item picked (F7-rest, F8, F9, F10) or say in one line why none is buildable; polish rows only after that. (2) cron prompt: slots 01:15/12:15/15:15 UTC, 12:15 run releases lock by 14:45, third slot ends 11-28. (3) reviewer prompts: container name koralink-postgres is the staging DB, and every 'missing' claim needs a named-flow grep before boarding. Also drop P2-329 from OWNER-QUEUE (resolved by PR #290). Report diff summary and commit. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-25, D-20261125-01):** Back up cron/jobs.json and koralink-factory-loop SKILL.md first. (1) In the factory cron prompt replace the P2-152 'prefer a USER-VISIBLE item' clause with: run report line 1 names the plan F-item picked (F7-rest, F8, F10) or says in one line why none is buildable; then small launch items (watchdog 8b, Contact page EN+AR); polish last. (2) Put the same rule and the reviewer pins (koralink-postgres is the staging DB; every 'missing' claim needs a named-flow grep) at the top of SKILL.md. (3) Make STATE.json carry one consistent field set (last_run, last_run_ts, last_run_id, summary all = newest run). Report: diff summary, backup file names, and grep proof of the new strings in both files. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.
- **Life OS WORKER request, not an owner decision (Life OS 2026-11-25, D-20261125-02):** In docs/plans/prod-on-vps.md and cutover-flip-checklist.md: (1) change the prod DB image from imresamu/postgis:16-3.5 (line 91) to a PG17 PostGIS tag, confirm the tag exists on the registry, because Neon dumps are PG17 (SET transaction_timeout); (2) restore command uses psql -v ON_ERROR_STOP=1 plus a table-count check (expect 32 tables); (3) A4 checklist says 'journal expects 60 after restore, then migrate to 62 before traffic'. Then ship watchdog section 8b (run scripts/offsite-freshness.sh from uptime-watchdog.sh, FAIL=1 on OFFSITE RED), disabled until GH_BACKUP_REPO is set so the unit does not go red. Report PR number and the registry tag proof. — Requested by the Life OS worker (Claude), not by the owner. Reversible work only; owner-only rules still apply.

## Closed since last run
- **D-20261113-09 restore drill:** CLOSED run #211 — premise stale (docs/runbooks/restore-drill.md exists since run #209 e575e58; drill PASSED). Runbook hardened same run. No owner action needed.
- **D-20261113-40 keep-warm Sentry path:** BUILT run #211 — PR #264 squash-merged f8cbb96; acceptance proven live (exit 0 + sentry_status=ok with symlink removed; timer serving fixed script). Remaining owner-side step: none (Claude removes the systemd drop-in post-merge).

- **P2-332 (cancel window + refund policy):** DECIDED 2026-11-11 (D-20261110-06: full refund until 12h before slot, then forfeit, platform-wide) AND SHIPPED run #202 — PR #241 merged `1896183`, LIVE E2E-verified (36h→REFUND / 2h→host-forfeit). Inside-window backfill exception kept by default (owner’s earlier verbatim rule); 48h veto window until 2026-11-14 02:30Z — veto ⇒ strict shape.
- **P2-350 (eviction concat asymmetry):** folded into PR #241, built run #202.
- **P1-66 (VAPID keys):** DECIDED 2026-11-07 (D-20261106-15 "Generate and set VAPID keys") AND ACTIVATED run #203 — keypair generated server-side (secrets only in apps/api/.env + pwa .env.local, never in chat/logs), API restarted and serving with push ENABLED (zero "not configured" warnings, health 200). PWA rebuild + browser subscribe test remain (NEXT_PUBLIC_* bakes at build).
- **P1-52 (Neon quota):** RESOLVED 2026-11-03 — direct prod Neon connect OK, no quota error.
