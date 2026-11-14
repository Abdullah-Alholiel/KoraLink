# Run #133 — P2-185: WS handshake CORS — reject at upgrade time (allowRequest)

**Mode:** autonomous (cron). **Lane:** API modules (133%4=1), security-lens emphasis.
**Reviewer A carried P2-185 forward as the run's IMPORTANT residual.**

## Gate 0 — Retro (the area I'm touching)

- `app.gateway.ts` `@WebSocketGateway` cors.origin factory (:68-74) calls
  `callback(null, true)` for EVERY origin; the real allowlist check runs inside
  `handleConnection` (:104-136) **after** the engine.io upgrade already completed.
  Post-connect there is a second auth layer (JWT verify + user re-read), so no data
  exposure — but unlisted origins still complete a full handshake+disconnect cycle.
- Standing sweep (Reviewer A): zero eq(col,null), zero ::uuid casts, ILIKE all escaped,
  lock/predicate discipline clean on sampled mutations, i18n parity 1095/1095 exact.
- DECISIONS.md consulted: no owner standard touches WS/CORS. PR #123-style pattern
  (shared helpers + escape hatch) is the house convention.

## Gates 1–3 — Program design (compact)

**Problem.** The handshake surface is wider than the comment implies: engine.io accepts
the upgrade for ANY origin (factory always `callback(null, true)`), then we disconnect.
Each probe = full handshake+disconnect cycle; identity still gated post-connect. Fix:
reject pre-upgrade via engine.io's `allowRequest` hook — zero handshakes from unlisted
browser origins, zero wasted cycles.

**Design (contract-first):**
- New pure helper `apps/api/src/common/utils/ws-origin.ts`:
  - `wsAllowRequest(req, allowedOrigins): boolean` — delegates to `originAllowed`
    (the SAME helper the REST side uses → one origin truth, no normalize drift).
  - `extractHandshakeOrigin(req): string | undefined` — `req.headers?.origin`
    (server-side header read, no `URL` constructor needed).
- `@WebSocketGateway({ ..., allowRequest: (req, cb) => cb(null, wsAllowRequest(req, this.buildAllowedOrigins())) })`
  — BUT: decorator cannot read `this`. Instead wire it in the constructor via
  decorator-factory function form: the decorator argument object is built lazily at
  decoration time by a module-scope factory `buildGatewayOptions()` that CLOSES OVER
  NOTHING (reads config at call time through a module-level ref set in onModuleInit... 
  
  → **REVISED (simplest working shape):** gateway options are built by a plain function
  `buildGatewayOptions(): WebSocketGatewayOptions` at decoration time; `allowRequest`
  closes over a module-level `let allowedOriginsProvider: () => string[]`. The gateway
  constructor sets it in `onModuleInit`. Race window: an engine.io upgrade arriving
  between module load and onModuleInit falls back to the bootstrap defaults
  (`http://localhost:3000` / `3002`) — same semantics as today's handleConnection
  defaults.
- `handleConnection` keeps the post-connect origin gate as defense-in-depth (unchanged),
  now using `originAllowed` (normalized compare, trailing-slash tolerance) instead of
  the raw `includes` — aligning the two layers on ONE comparison rule.
- `disconnectUser` and all handler gates untouched.

**API JSON shapes:** none changed. No DB, no i18n keys (server-side rejection carries no
client copy), no schema/migration. Zero user-visible copy changes.

**Files changed:**
- `apps/api/src/common/utils/ws-origin.ts` (new, ~30 lines)
- `apps/api/src/modules/gateway/app.gateway.ts (options + handleConnection comparison)
- `apps/api/src/modules/gateway/ws-origin.spec.ts` (new, behavioral spec)

## Gate 3 checklist

- [x] Every mutation endpoint returns populated object — N/A (no new endpoints)
- [x] Frontend types accept the exact JSON — N/A (no wire change; handshake responses only)
- [x] Adapter functions exist for API shapes — N/A
- [x] No field silently undefined — N/A
- [x] i18n keys exist for user-facing strings — N/A (server-side rejection, no client copy)

## Gate 4 slices

1. ws-origin.ts helper + 8-case behavioral spec (RED first)
2. Gateway wiring (allowRequest + handleConnection alignment) — build + full gates
3. PR flow: branch → push → 4 bot checks → PR-Agent triage → squash
