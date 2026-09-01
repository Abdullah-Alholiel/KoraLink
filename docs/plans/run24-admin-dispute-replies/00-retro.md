# Run #24 — Gate 0 Retrospective (admin dispute replies)

## Context this run
- Prestate script `koralink-factory-prestate.py` was MISSING from profile scripts (cron `script:` field points there) → the 10:15Z cron fire died at boot with `HTTP 402: Insufficient Balance` on opencode-go (`failure_streak: 1`, stale lock left at 10:17Z). **Repaired this run**: copy found in `/home/ubuntu/.hermes/scripts/` (sibling misplaced it), restored to `/home/ubuntu/.hermes/profiles/koralink/scripts/` +chmod x. This run probed provider state manually per runbook.
- z.ai weekly bucket sat at 92% (reset 15:40Z) → zero-LLM phases ran first; reviewers dispatched only after the reset probe confirmed headroom. Go weekly 15% — untouched.
- Strix monthly scan: DUE (Sep 1, no strix_scan= in STATE notes) but **DEFERRED — z.ai weekly >75% at decision time** (standing rule). Recorded in STATE.json notes for the next run to pick up.
- Sibling work since run #23 (worked alongside, never staged): `10f94ce` **builds P2-8 completely** (push-text.ts catalog, 8 sites, Promise.allSettled fan-out, RTL worker, +10 tests) → P2-8 verified-TRUE this run (17/17 notif specs), boarded DONE. `c8540ae` demo-edition seed v2 (925-line seed rewrite: 26 users, Women-Only, live POTM vote).
- Sentry 24h triage: zero new actionable signatures. `KORALINK-API-Q` (3× `POST /admin/disputes//resolve` 404) traced to **curl 8.5.0 vs localhost** — local diagnostic, not the console. All other signatures = run #23's known-noise list.

## Area audit — admin dispute replies (P2-2)
- Board evidence confirmed live: `dispute_messages` table (schema.ts:817) has **zero write paths** — grep across apps/api: only schema decl + relations; admin `disputes.service.ts:68` reads messages into `findOne`; detail page renders them (`disputes/[id]/page.tsx:224-241`) but no composer exists.
- Contract check: `findOne` (populated, relations) is the house return shape — `addMessage` must return `this.findOne(id)` outside any tx (single insert → no tx needed).
- Admin state check: `apps/admin` + partner/admin API surface **clean** (no hold). Admin service active. Last admin commits are run #22 i18n work.
- fix:feat ratio recent 15 commits: 2 fix / 4 feat / rest docs+kanban — healthy.

## Decision: pick P2-2 (build item)
Queue was P2-8 (stale-DONE by sibling), P2-31(3) (docs-only, "documented limitation" is the resolution), P2-13 (needs radius-scoring product decision), P2-29/P2-32/P1-16 (need Abdullah). **P2-2 is the highest-priority self-contained, finishable item**: restores a broken ops loop (admin cannot answer a player's dispute → disputes stall → moderation SLA suffers). Security/data-integrity > broken user flow > missing functionality: nothing higher qualifies today.
- Scope decision: allow posting messages on disputes in ANY status (opened/under_review/resolved/rejected) — closing-the-loop replies after resolution are legitimate ops; no artificial status gate. Recorded here.
- Player-side reply flow: deliberately OUT of scope this run (PWA has no dispute thread UI; AppealSheet is the player entry). Board row updated to say so.
