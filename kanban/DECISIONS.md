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
