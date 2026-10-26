# Run #167 — P2-47(b) restore-on-behalf — Gate 0 Retrospective (autonomous)

## Ledger check (DECISIONS.md read FIRST — supremacy rule)
- P2-47 DECIDED 2026-10-25: **option (b) full restore-on-behalf** (owner chat) → build authorized this run (pick-order item 2).
- Drawer RIGHT in both locales (d0862a7) — untouched; this slice adds an ACTION inside the existing RecordDrawer, no layout change.
- PDPL/PII stance stays owner-only — but the owner already DECIDED the capability; the implementation adds no new PDPL interpretation: restore is only possible while the data still exists (soft-delete grace window). Hard-purged ghosts stay irreversible (migration 0031 erasure promise — restoring anonymized PII is impossible by construction).
- No design/UX change contradicts the ledger.

## Admin state check (Phase 3.5 step 0)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → CLEAN.
- `git log --oneline -8 -- apps/admin`: 124f37a (P2-216), 1ba97e5 (P2-253 blackout UI), 83f8018/bc5c817 (P2-250 provenance).
- `systemctl --user is-active koralink-admin.service` → active.
- Routes live: users page exists with status=deleted view + purge visibility (P1-37, run #31/#32).
- Verdict: NO HOLD — proceed.

## Area audit (what this slice touches)
- `apps/api/src/modules/admin/users.service.ts` — update() carries the PDPL ghost guard (184: `deleted_at` → 409, moderation frozen on ghosts), self-moderation guards, last-admin FOR UPDATE tx (P2-116), P2-141 caller-tx path, audit via AuditService (executor-aware), realtime broadcastOps, disconnect + activities fan-out.
- Purge pipeline: `UsersService.purgeExpiredAccounts()` (users.service.ts:1385) — cron `0 */5 * * *` (users.scheduler.ts:31); anonymizes rows past `deleted_at + 30d`; atomic UPDATE+push-subscription DELETE (run-#31 resume hardening); sets phone `purged-<id12>`, full_name 'Deleted User', nulls handle/avatar/home/email.
- **Key design fact:** the purge candidate predicate is `deleted_at < now() - 30d` — nulling `deleted_at` REMOVES the row from the pipeline. One verb (restore) therefore covers BOTH boarded halves of P2-47: "cancel a scheduled purge" AND "restore-on-behalf". No schema change (restore token is a client-held JWT — verified: no restore_token column in schema.ts).
- Reviewers this run: A clean (0 CRITICAL/0 IMPORTANT; HEX PASS), B verified all 8 run-#166 claims TRUE + 2 new P2 findings (dispute-sheet offline guard; payout email locale default) → boarded, not built here (this run's build budget belongs to the owner-decided user-visible item).
- Tech-debt note: standing pickups unchanged (P2-262 const, P2-248 cluster, P2-217 hex decision).
- OS research (Phase 1.7): pgroll (xataio/pgroll) — zero-downtime reversible PG migrations; → ONE backlog card; never adopted mid-run.

## Findings → user-story cascade
- Admin opens users ops → status=deleted → clicks a ghost row → drawer shows purge countdown but ZERO actions (`userStatus(selected) !== 'deleted' ? actions : undefined`, users/page.tsx:493) → support cannot help a "changed-my-mind" user → owner decided this must exist (option b).
- Fix shape: restore action in the drawer (soft-deleted, grace window only) + API verb with audit + race-safe predicate.

## Verdict
Proceed to Gate 1/2/3 (compact in 01-program-design.md) → Gate 4 slices on lane branch.
