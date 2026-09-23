# Run #67 — Gate 0 Retrospective (DB & Infra lane, 67%4=3)

## Baseline
- staging HEAD `fd0d503` (run #66 recovery, 2026-09-21T10:36Z). Clean tree; projects-dir feature lane still mid-merge conflict (4 UU files + staged admin edits, NO MERGE_HEAD) → **ADMIN HOLD continues** (P2-12, audit-lane admin findings held).

## Recent-cycle audit
- Run #66 (dead session adopted): 3 review fixes + P2-79 residual. All four in_review claims **independently re-verified this run at file:line** (greps + reviewer B + jest on final tree) → promoted DONE.
- Reviewer A (DB & Infra scope): migrations journal 45 tags = 45 .sql files 1:1, no orphan, newest `when` below live time (no re-fire). P2-78/P2-80 migrate-vps fixes intact with tripwire spec. deploy-staging.sh build→migrate→restart ordering correct. CSP P2-42 unchanged (expected). **IMPORTANT: drizzle meta snapshot gap** — `apps/api/drizzle/meta/` jumps 0026→0029 and stops there while the journal runs to 0043; a future `drizzle-kit generate` would diff against a stale snapshot and emit spurious DDL. Boarded as P2-88 (dedicated cycle — regenerating snapshots mid-chain is not a quick fix).
- Reviewer A candidates **refuted**: `count+1 >= max_players` at matches.service.ts:1601 is CORRECT (join guard `count >= max` rejects an already-full match; `count+1 >= max` flips Full when this join takes the last seat — complementary, both inside the same FOR UPDATE tx). Board backlog items "seed header says 8 users" (header now says 26, correct) and "gateway JWT_SECRET fallback-dev-secret" (line is now `getOrThrow`, app.gateway.ts:115) are BOTH already fixed — dead backlog lines to prune.

## Fix:feat ratio
Last 15 staging commits: 3 review-fix + 1 a11y feat + board/docs — healthy, no reactive loop.

## Standing bug classes (sweep)
No ::uuid casts, no eq(col,null), FOR UPDATE present on money/roster paths, spots count unfiltered (host counted), no console.* in API modules. Clean.

## Sentry / error triage (Phase 1.6)
Sentry API (EU base, read token OK): **zero new events since Sep 14** in either project; all 27 issues are stale classes (CORS probe noise ×110, demo-pod P2-51 drift, pre-fix hydration WEB-D ×7 — last Sep 14). journalctl err-level: 0 lines across api/pwa/admin in 5h. Services all active, /health 200. → No new P0/P1 from errors.

## Audit lane (Phase 1.8 — FIX before HUNT)
- run-2 `api.admin.reports.resolve.ban-before-status-transition` (LOW, confirmed, un-fixed): admin API surface → **ADMIN HOLD**, boarded P2-89 TODO with hold note.
- run-1 `api-auth:per-ip-cap-proxy-trust` (needs_validation): owner checklist item (verify trust-proxy so req.ip is the real client IP behind Traefik/Tailscale) — surfaced in report, not buildable autonomously.
- HUNT: skipped — quota-economics rule (board holds P1 buildable items + admin hold limits scope). Rotation next due: (67+1)%4=0 → api-auth.

## Decision
Proceed to a PWA-lane slice (ADMIN-safe): **P2-87 push-unsubscribe silent failure** (Reviewer B P1, run #67) + small aria-label polish rider if budget allows.
