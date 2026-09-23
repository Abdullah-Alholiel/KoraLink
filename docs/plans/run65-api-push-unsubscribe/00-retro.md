# Run #65 — Gate 0 Retro (API lane, 65%4=1): notifications push surface

**Baseline:** `1e03b1f` (run #64 docs) / feature tip `91ab5e6`.

## Prior-run claims verified THIS run (before picking)

| Claim | Verdict | Evidence |
|---|---|---|
| P2-73 SW offline restore (91ab5e6) | **CONFIRMED** | worker pins `RESTORE_CACHE`/`cache.put` in catch + `cache.delete` in success (worker/index.js:27-28,:61,:71-72); reader TTL/`FRESH_SAVE_MS` (sw-offline-restore.ts:15,:18,:21,:54-56); offline page `location.assign` CTA (:61); targeted vitest 11/11; full suite 87f/619t; type-check 0; funnel `/ar/offline` → 200. Reviewer B independently re-verified all 6 sub-claims — zero refuted. |
| P1-50 ban force-disconnect "build candidate" | **ALREADY DONE (stale candidate)** | Built run #57 (`2c71671`): `AppGateway.disconnectUser(userId)` (app.gateway.ts:584-587, `disconnectSockets(true)` over the user room) called by `AdminUsersService.update()` (users.service.ts:258) gated ban/suspend-only; verified run #58. NOT rebuilt. |

## Health / error triage (Phase 1.5 + 1.6)

- api/pwa/admin all `active`; `GET /api/v1/health` → 200; **zero** journal `-p err` entries in 5h.
- Sentry 24h (de.sentry.io, read token 200): API newest event 2026-09-11 (CORS evil.example
  probes ×110, standing), web newest 2026-09-14 (hydration class). **Zero new signatures.**
- Phase 1.8: `/home/ubuntu/audits/koralink/run-1|run-2` — no un-fixed confirmed findings.
- Strix: not due (Sep 20; window 1st–3rd; next Oct 1).

## Tech-debt audit of the area I'm touching (notifications module)

- **CRITICAL:** none.
- **IMPORTANT (Reviewer A, run #65):** controller uses ad-hoc TS interfaces (`SubscribeBody`,
  `{endpoint:string}`) — plain interfaces are invisible to the global `ValidationPipe`
  (main.ts:110, whitelist+forbidNonWhitelisted+transform), so `endpoint` ships unvalidated on
  BOTH subscribe and unsubscribe (notifications.controller.ts:20-28,:53-61).
- **IMPORTANT (board P2-76 (1)):** `DELETE /notifications/unsubscribe` carries the endpoint in
  the request BODY; DELETE bodies are legitimately dropped by some proxies/clients → silent
  unsubscribe failure for those users.
- MINOR: 13 `.returning()` sites service-wide (spot-checked — deliberate in wallet/mailer);
  subscribe `locale` free-form string (narrow it opportunistically here, not over-strict).
- Fix:feat ratio healthy (last 15 commits: 11 feat/docs : 2 fix : 2 infra).

## Pick decision

**P2-76 (1) — POST unsubscribe variant + class DTO (unsubscribe only).** Security/correctness
of a broken user flow (unsubscribing users keep receiving pushes). Vertical-slice sized:
1 controller + 1 DTO file + 1 hook line + tests. P2-76 (2) (critical-event non-push channel)
stays folded into the P1-41 email-provider owner decision per the board row — NOT built here.
