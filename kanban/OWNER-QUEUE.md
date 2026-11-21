# KoraLink Owner Decision Queue

## Snapshot
- Open PRs: 0 (run-#220 item merged same-run: **#285** P2-371 Playwright layout-audit harness + staging baseline, squash `9c0f3662`, CI 8/8 ×4 heads + PR-Agent 4 rounds all triaged).
- **⚠ URGENT: PROD API IS STALE — Render deploy of promote #276 CRASHED 11-18 (storage env boot throw). Prod API serves the SEP-25 build; Vercel PWA+admin deployed NEW. ALL fixes are MERGED to staging (#277–#284). Your one word "GO" (section 2) heals prod. Zero new migrations ride it (repo journal 62; live Neon 62 + journal-exempt PostGIS row — verified run #218). Release-verify FAILS on a stale build (PR #279), so a repeat of the silent rollback is stamped red on the promote commit automatically.**
- Promote gap: staging is 15 commits ahead of main (runs #216–#220 ride the merge); last promote 2026-11-18 (PR #276). Pending migrations on next promote: NONE (PR #285 is scripts/docs-only; repo journal 62 = live Neon 62). Promote = owner GO per D-20261113-28.
- Services: API :3001 healthy on 047d202b (Turnstile parity helper + guard live), PWA :3000 + admin :3002 active. ⚠ Tailscale funnels DOWN ("Logged out") since 11-19 ~02Z — :9450/:10000/:8443 unreachable until owner re-auth (`sudo tailscale up`); loopback verification substitutes.
- Built recently: #220 P2-371 Playwright layout audit baseline (PR #285; findings boarded as P2-391/P2-392); #219 P2-382 Turnstile parity (PR #284); #218 P2-390 legal truth-fix + email guard (PR #283) + P2-386/P2-381 login+host offline (PR #282); #217 P2-384 match-detail offline (PR #280) + P2-387 release-verify SHA guard (PR #279) + P2-385 storage hardening trio (PR #281); #216 P0-12 storage boot guard (PR #277) + P2-367 RTL wraps (PR #278).
- Owner decisions waiting: none NEW this run. Standing: P2-325 webhook dashboard URL (go-live gated), F1 arming keys (NEW-9), Moyasar live keys = post-launch milestone (D-20261113-03), recurring-series identity re-review (D-20261106-11 owner note).

## Active owner actions

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

### NEW-1. P2-325 — Moyasar webhook registration (NEW run #196)
- **What:** Wallet top-up credit currently depends on the client verify call + the 5-min reconcile backstop (webhook-less flow, wallet.reconcile.service.ts:34). A player who pays then closes the app before verify waits for the cron rescue. Industry norm = signed webhook capture.
- **Your part:** Moyasar dashboard → register a webhook URL for invoice/payment events (the factory builds the signature-verify endpoint once the URL exists).
- **Close line:** "P2-325: webhook URL registered — build the verify endpoint" OR "P2-325: reconcile backstop is enough for now".
- **Deadline:** Before prod launch (money-adjacent).

### NEW-2. P2-327 — admin console MFA (NEW run #196, follows RBAC)
- **What:** The admin console (settlements void/pay, refunds, CSV exports) sits behind password-only auth; no 2FA anywhere. Per D-20261106-14 RBAC design comes first; MFA is the follows-item.
- **Close line:** "P2-327: plan MFA after RBAC" OR "P2-327: not needed (VPS-private console)".
- **Deadline:** Before staff accounts exist.

### NEW-3. P2-328 — promo/coupon system shape (NEW run #196, CEO-lane)
- **What:** No discount codes exist (grep 0 hits); competitors run first-game discounts heavily in KSA. Needs product shape: % vs flat, per-venue vs platform, stacking rules.
- **Close line:** "P2-328: build <shape>" OR "P2-328: defer post-launch".
- **Deadline:** None (acquisition lever, not a gap).

### NEW-4. P2-329 — player no-show fee policy (NEW run #196, CEO-lane)
- **What:** A player who no-shows a PAID match owes nothing (fee is refunded on cancel; karma penalties only). Host math goes negative with zero recourse. Needs your call: fee vs karma vs both.
- **Close line:** "P2-329: <fee/karma/both>" OR "P2-329: defer".
- **Deadline:** Before paid matches go live at scale.

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
- **Owner decision (Life OS 2026-11-07, D-20261106-02 + chat 2026-11-13, D-20261113-28):** owner checks UI/UX on staging and says GO in chat; the AI then executes migrate-first + the merge + deploy, and reports back.
- **NEW run #216 (2026-11-19): the promote is no longer routine — it is the PROD HEAL.** Promote #276's Render deploy CRASHED at boot (Render logs: `Storage env incomplete: S3_* are required` — StorageModule boot throw; SeaweedFS is staging-only). Render rolled back to the Sep-25 build: **prod API has missed every release since Sep 25** while Vercel PWA+admin deployed new (players' apps now call endpoints prod doesn't have: receipts, waitlist chips, bell pagination, coded topup errors). Fix PR #277 is MERGED to staging; one owner "GO" triggers: assemble promote PR → verify Neon 62==62 (no migrations pending) → merge → Render deploys a post-fix SHA (boots clean without S3_*) → verify Render `live` + prod health `turnstile` block.
- **Your one word:** "GO" in chat (after your own staging check).
- **Optional hardening:** Render dashboard → koralink-api → Settings → Pre-Deploy Command `node scripts/migrate-vps.mjs` (closes P2-51 drift permanently).
- **Neon housekeeping (optional, 10 min):** check koralink-prod Usage/plan; delete `koralink-prod-pg18-empty` experiment. Nightly prod dumps LIVE (koralink-backup-prod.timer 03:20 UTC, 30-day retention) + watchdog freshness alarm covers prod.

### 4. P0-2 sandbox → live Moyasar
- **Owner decision (Life OS 2026-11-07, D-20261106-04):** Flip WALLET_TOPUP_ENABLED and test
- **What:** Flip `WALLET_TOPUP_ENABLED=true` + real Moyasar sandbox keys on staging; run one SAR 5.00 top-up with test card 4201320111111010.
- **Close line:** "P0-2 sandbox tested" OR "P0-2: flip WALLET_TOPUP_ENABLED and test".
- **Deadline:** Before prod launch; optional for staging now.

### 5. P1-41 email live
- **Owner decision (Life OS 2026-11-07, D-20261106-05):** Defer to pre-launch — And i think its already set but we can check pre pandh
- **What:** Provision Resend API key + `MAIL_FROM` in API env to enable transactional email transport.
- **Close line:** "Email live: RESEND_API_KEY set".
- **Deadline:** Before prod launch.

### 6. P1-45 admin push composer
- **Owner decision (Life OS 2026-11-07, D-20261106-06):** Admin plus venue-owner scoped
- **What:** Who may broadcast maintenance/venue-closure notices? Admin only? Partners to their venue rosters? What guardrails?
- **Close line:** "P1-45: admin-only broadcast" OR "P1-45: admin + venue owner scoped".
- **Deadline:** Not urgent.

### 7. P2-297 — hidden review rating policy
- **Owner decision (Life OS 2026-11-07, D-20261106-07):** Hidden reviews still count
- **What:** When a venue review is hidden/restored/deleted, should `venues.rating_avg`/`rating_count` be recomputed? Does hiding remove it from the public average?
- **Close line:** "P2-297: hidden reviews do NOT count" OR "P2-297: hidden reviews still count".
- **Deadline:** Before building rating-recompute slice.

### 8. P1-69 player wallet withdrawal
- **Owner decision (Life OS 2026-11-08, D-20261106-08):** Defer until post-launch — Back in the wallet not to their bank.
- **What:** Withdrawal rail (bank transfer? wallet-to-wallet? instant SAR?); KYC threshold; fees.
- **Close line:** "P1-69: bank-transfer withdrawal with IBAN" OR "P1-69: defer until post-launch".
- **Deadline:** Before building withdrawal path.

### 9. P1-73 — dev-login on staging (factory re-assessed run #193)
- **Owner decision (Life OS 2026-11-07, D-20261106-09):** Keep dev-login on staging
- **What:** Factory VERIFIED dev-login 403s in prod and assessed staging-on usage as deliberate owner workflow → reclassified ACCEPTED-RISK on the board (run #193). Owner confirmation still welcome.
- **Close line:** "P1-73: keep dev-login on staging" (confirms the accepted-risk) OR "P1-73: disable dev-login on staging".
- **Deadline:** Before public launch.
- **What:** Should `DEV_LOGIN_ENABLED` stay `true` on staging? Factory recommends `false` (only real OTP) unless explicit staging-only dev-login policy.
- **Close line:** "P1-73: disable dev-login on staging" OR "P1-73: keep dev-login on staging".
- **Deadline:** Before public launch.

### 11. P1-72 staging posture — CLOSED by factory run #209 (verify-only)
- **Owner decision (Life OS 2026-11-07, D-20261106-10):** Apply posture — flags were ALREADY SET in apps/api/.env (COOKIE_SECURE=true, SWAGGER_ENABLED=false; DEV_LOGIN_ENABLED untouched per owner) and the API has been serving them. Run #209 executed the REQUESTED VERIFICATION (D-20261113-08 proof): GET /api/docs → **404**, dev-login Set-Cookie → **HttpOnly; Secure; SameSite=Lax**, /health 200. No env change was needed; Strix MEDIUM is closed on staging evidence.
- **Closed:** 2026-11-15 (run #209). Ledger row added to kanban/DECISIONS.md.

### 10. Recurring-match series identity (run #121)
- **What:** Confirm 8 weekly instances are independent matches (no series id); cancelled week does not propagate.
- **Close line:** "Confirmed: recurring matches are independent".
- **Deadline:** Before building any recurring-match editing/cancellation logic.

### 12. P1-76 — social sign-in (Apple/Google) (NEW run #189)
- **Owner decision (Life OS 2026-11-07, D-20261106-12):** Build Apple first post-launch
- **What:** Do we add Apple/Google sign-in? iOS App Store REQUIRES Sign in with Apple once any third-party login exists; Saudi market expects low-friction signup vs OTP. Priority vs other auth work?
- **Close line:** "P1-76: build Apple first post-launch" OR "P1-76: defer, OTP is fine for now" OR "P1-76: plan a Gate cycle".
- **Deadline:** Before iOS App Store submission.

### 13. P2-311 — receipt/invoice artifact shape (NEW run #189, folds into P2-145)
- **Owner decision (Life OS 2026-11-07, D-20261106-13):** In-app receipt MVP — And can be exported as invoice
- **What:** Players top up + hosts pay pitch costs with no printable artifact (CSV export only). What shape: in-app receipt page? PDF invoice w/ VAT? Defer ZATCA e-invoicing?
- **Close line:** "P2-311: in-app receipt MVP" OR "P2-311: PDF invoice w/ VAT" OR "P2-311: defer".
- **Deadline:** Not urgent; before formal B2B venue contracts.

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

## Closed since last run
- **D-20261113-09 restore drill:** CLOSED run #211 — premise stale (docs/runbooks/restore-drill.md exists since run #209 e575e58; drill PASSED). Runbook hardened same run. No owner action needed.
- **D-20261113-40 keep-warm Sentry path:** BUILT run #211 — PR #264 squash-merged f8cbb96; acceptance proven live (exit 0 + sentry_status=ok with symlink removed; timer serving fixed script). Remaining owner-side step: none (Claude removes the systemd drop-in post-merge).

- **P2-332 (cancel window + refund policy):** DECIDED 2026-11-11 (D-20261110-06: full refund until 12h before slot, then forfeit, platform-wide) AND SHIPPED run #202 — PR #241 merged `1896183`, LIVE E2E-verified (36h→REFUND / 2h→host-forfeit). Inside-window backfill exception kept by default (owner’s earlier verbatim rule); 48h veto window until 2026-11-14 02:30Z — veto ⇒ strict shape.
- **P2-350 (eviction concat asymmetry):** folded into PR #241, built run #202.
- **P1-66 (VAPID keys):** DECIDED 2026-11-07 (D-20261106-15 "Generate and set VAPID keys") AND ACTIVATED run #203 — keypair generated server-side (secrets only in apps/api/.env + pwa .env.local, never in chat/logs), API restarted and serving with push ENABLED (zero "not configured" warnings, health 200). PWA rebuild + browser subscribe test remain (NEXT_PUBLIC_* bakes at build).
- **P1-52 (Neon quota):** RESOLVED 2026-11-03 — direct prod Neon connect OK, no quota error.
