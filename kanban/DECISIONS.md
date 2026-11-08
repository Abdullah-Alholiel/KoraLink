# KoraLink Owner-Decision Ledger

Single source of truth for every product/UX standard Abdullah has set. Latest dated entry
wins. **Gate 0 MUST consult this file before any design/UX change; a "standard" claimed by
a skill file, checklist, or board row that contradicts this ledger is VOID.** Runs append
new entries the moment Abdullah decides something in chat or code (commit-anchored).

| Date | Decision | Source | Notes |
|---|---|---|---|
| 2026-08-26 | Wallet top-up stays a dummy, gated `NODE_ENV=production`; no real PSP until owner provisions one | commit `f109cf6` + board P0-2 | blocks P1-8/P1-14/P1-29 money paths |
| 2026-08-31 | **Admin Drawer = RIGHT-hand side panel in BOTH locales; main menu pinned LEFT, always visible** | commit `d0862a7` ("Correction to the previous drawer commit…Abdullah 2026-08-31") | PR #77 (2026-10-04) violated this; reverted same day |
| 2026-09-07 | Admin data tables = DataTable container-query standard (700px), column roles identity/value/meta/detail, IDs+actions ONLY in RecordDrawer, server sort via whitelist | board P2 rows + shipped standard (runs #21–#24 era) | reinforces RecordDrawer rule |
| 2026-09-1x | Notification bell lives in Feed ONLY (P2-34 reversal) — no global bell in player PWA | board P2-34 row | admin bell (P1-56) is separate and approved |
| 2026-09-08 | Marketing = EN+AR always (Tajawal, RTL, Arabic-Indic numerals); Abdullah drives design via reference images | standing convention | applies to all user-facing copy |
| 2026-10-04 | **Re-affirmed: Drawer RIGHT-hand panel** (owner authorized reverting PR #77's LEFT flip after Opus delivery audit flagged it) | chat go-ahead 2026-10-04 + revert PR | see P2-142/PR #77 history |
| 2026-10-04 | **Default + 48h-veto adopted** for non-money, non-PDPL, non-credential decisions: the loop proposes a default in a decision brief, builds after 48h unless Abdullah vetoes. OWNER-ONLY list = PSP, Resend/Brevo keys, release promote go, PDPL stances, RBAC org design, account/credential actions | chat go-ahead 2026-10-04 (Opus audit rec #2) | register lives in BOARD.md §Defaults+Veto |
| 2026-11-03 | **Prod DB mutations + promote merge = owner-only** (standing; DB actions in owner-only register). Prod Neon 0045–0058 applied by factory with explicit owner go ("Go" 2026-11-03) — 60/60 verified. CORRECTION on record: earlier "empty prod" alarm was a probe of the `koralink-prod-pg18-empty` experiment project, not prod; watchdog now resolves the endpoint live from Render env. | chat go 2026-11-03 + verified apply | PR #178 body v2; watchdog §7 |

| 2026-10-25 | P1-69 dispute taxonomy default ACCEPTED (existing DisputeType enum, 5 types, zero schema change) — run ≥ #166 builds player dispute origination | owner chat 2026-10-25 | veto window closed early by owner |
| 2026-10-25 | P0-2 PSP DECIDED: **Moyasar** — sandbox-first (free test keys, wired on prod as demo), live keys only after CR/company registration; mada first-class. Strategy: docs/plans/psp-sandbox-moyasar/00-strategy.md | owner chat 2026-10-25 | OWNER-ONLY item closed by owner |
| 2026-10-25 | Upload pipeline DECIDED: **self-hosted MinIO on the VPS via Coolify** (Tailscale-bound); R2 deferred (account has R2 disabled — dashboard-only step; revisit at public launch). Plan: docs/plans/upload-pipeline-vps/00-plan.md | owner chat 2026-10-25 | covers P1-38 venue photos + P2-50 avatars |
| 2026-10-25 | P2-47 DECIDED: **(b) full restore-on-behalf** (support can restore past grace) | owner chat 2026-10-25 | gate cycle to follow |
| 2026-10-25 | P2-214 DECIDED: **path (a) + partner EMAIL notifications** for payout / pitch / match-cancellation updates to partners' registered emails | owner chat 2026-10-25 | mailer exists (Brevo on Render); one email-lane slice |
| 2026-10-25 | P1-12 admin/partner RTL visual sign-off: owner CONFIRMED all good | owner chat 2026-10-25 | closed |
| 2026-10-25 | Promote audit verdict: **SAFE to promote** staging→main (audit checklist passed 2026-10-25; order = Neon migrations first, then promote merge, then manual Render deploy, then pre-deploy hook) | agent audit, owner session 2026-10-25 | merge click stays owner-only T2 |
| 2026-10-30 | Owner-authored code landed directly: **PR #196 (P2-281 design MINORs M-1..M-4)** built + merged by Abdullah himself (branch p2-281-design-minors, 4 PR-Agent rounds, squash e89ce02 19:16Z) while no factory run was live; factory verified the deploy run #177 | commit `e89ce02` + reflog | attribution: owner-resolved (owner-authored commit) |
| 2026-11-05 | **Prod + staging move to this VPS via Coolify — PLAN FIRST** (P0-11 / card t_459699ef): no infra change until the owner approves the plan's numbered approvals; prod DB = separate container, agents never hold prod creds; payments stay Moyasar sandbox (PAYMENTS_LIVE=false) until CR or freelance.sa certificate; offsite backups never Cloudflare R2 (unreachable from this VPS) | owner chat 2026-11-05 via Claude | Momentum launches first; KoraLink demo-ready in parallel |
| 2026-11-07 | Approve the Coolify move of prod+staging onto the VPS (P0-11)? → Approve plan, start A2 | Life OS portal D-20261106-01 | PDPL residency; plan ready in docs/plans/prod-on-vps.md, 8 approvals; OWNER-QUEUE §1 |
| 2026-11-07 | Merge promote PR #178 (staging to main)? → Wait for Coolify cutover | Life OS portal D-20261106-02 | 390 commits waiting; prod Neon fully migrated 60/60; owner-only click; OWNER-QUEUE §2 |
| 2026-11-07 | Settlements: may duplicate/erroneous rows be voided? (P2-285) → Void pending only, with audit trail | Life OS portal D-20261106-03 | Blocks any settlement cancellation feature; OWNER-QUEUE §3 |
| 2026-11-07 | Test Moyasar sandbox top-up on staging (P0-2)? → Flip WALLET_TOPUP_ENABLED and test | Life OS portal D-20261106-04 | Needed before prod launch; sandbox keys, SAR 5 test card; OWNER-QUEUE §4 |
| 2026-11-07 | Provision Resend key and MAIL_FROM for live email (P1-41)? → Defer to pre-launch (owner note: And i think its already set but we can check pre pandh) | Life OS portal D-20261106-05 | Transactional email needs it before launch; OWNER-QUEUE §5 |
| 2026-11-07 | Who may broadcast admin push notices? (P1-45) → Admin plus venue-owner scoped | Life OS portal D-20261106-06 | Maintenance/venue-closure notices have no composer; OWNER-QUEUE §6 |
| 2026-11-07 | Do hidden reviews count in venue rating average? (P2-297) → Hidden reviews still count | Life OS portal D-20261106-07 | Needed before rating-recompute slice; OWNER-QUEUE §7 |
| 2026-11-07 | Keep dev-login enabled on staging? (P1-73) → Keep dev-login on staging | Life OS portal D-20261106-09 | Factory recommends off; before public launch; OWNER-QUEUE §9 |
| 2026-11-07 | Apply staging cookie/Swagger hardening (P1-72)? → Apply posture | Life OS portal D-20261106-10 | Closes Strix MEDIUM; set COOKIE_SECURE=true, SWAGGER_ENABLED=false; OWNER-QUEUE §11 |
| 2026-11-07 | Add Apple/Google social sign-in? (P1-76) → Build Apple first post-launch | Life OS portal D-20261106-12 | App Store needs Sign in with Apple once any social login exists; OWNER-QUEUE §12 |
| 2026-11-07 | Receipt/invoice shape for top-ups and pitch payments (P2-311) → In-app receipt MVP (owner note: And can be exported as invoice) | Life OS portal D-20261106-13 | No printable artifact today; OWNER-QUEUE §13, folds into P2-145 |
| 2026-11-07 | Fine-grained admin RBAC: who gets which admin rights? (P1-59) → Design RBAC before adding staff roles | Life OS portal D-20261106-14 | AdminAuthGuard is role-only; BOARD.md P1-59, RBAC is owner-only |
| 2026-11-07 | Provision VAPID keys to turn on web push? (P1-66) → Generate and set VAPID keys | Life OS portal D-20261106-15 | Whole push stack ships but is dead without keys; BOARD.md P1-66 |
| 2026-11-08 | Player wallet withdrawal: which rail? (P1-69) → Defer until post-launch (owner note: Back in the wallet not to their bank.) | Life OS portal D-20261106-08 | Needed before building withdrawal; bank/KYC/fees; OWNER-QUEUE §8 |
| 2026-11-08 | Confirm recurring-match weeks are independent matches → Confirmed: independent (owner note: Review and assess situation fully and re assess recomended decision depending on my app !) | Life OS portal D-20261106-11 | Gates recurring-match edit/cancel logic; OWNER-QUEUE §10 |
