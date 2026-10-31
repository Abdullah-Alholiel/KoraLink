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

| 2026-10-25 | P1-69 dispute taxonomy default ACCEPTED (existing DisputeType enum, 5 types, zero schema change) — run ≥ #166 builds player dispute origination | owner chat 2026-10-25 | veto window closed early by owner |
| 2026-10-25 | P0-2 PSP DECIDED: **Moyasar** — sandbox-first (free test keys, wired on prod as demo), live keys only after CR/company registration; mada first-class. Strategy: docs/plans/psp-sandbox-moyasar/00-strategy.md | owner chat 2026-10-25 | OWNER-ONLY item closed by owner |
| 2026-10-25 | Upload pipeline DECIDED: **self-hosted MinIO on the VPS via Coolify** (Tailscale-bound); R2 deferred (account has R2 disabled — dashboard-only step; revisit at public launch). Plan: docs/plans/upload-pipeline-vps/00-plan.md | owner chat 2026-10-25 | covers P1-38 venue photos + P2-50 avatars |
| 2026-10-25 | P2-47 DECIDED: **(b) full restore-on-behalf** (support can restore past grace) | owner chat 2026-10-25 | gate cycle to follow |
| 2026-10-25 | P2-214 DECIDED: **path (a) + partner EMAIL notifications** for payout / pitch / match-cancellation updates to partners' registered emails | owner chat 2026-10-25 | mailer exists (Brevo on Render); one email-lane slice |
| 2026-10-25 | P1-12 admin/partner RTL visual sign-off: owner CONFIRMED all good | owner chat 2026-10-25 | closed |
| 2026-10-25 | Promote audit verdict: **SAFE to promote** staging→main (audit checklist passed 2026-10-25; order = Neon migrations first, then promote merge, then manual Render deploy, then pre-deploy hook) | agent audit, owner session 2026-10-25 | merge click stays owner-only T2 |
| 2026-10-30 | Owner-authored code landed directly: **PR #196 (P2-281 design MINORs M-1..M-4)** built + merged by Abdullah himself (branch p2-281-design-minors, 4 PR-Agent rounds, squash e89ce02 19:16Z) while no factory run was live; factory verified the deploy run #177 | commit `e89ce02` + reflog | attribution: owner-resolved (owner-authored commit) |
