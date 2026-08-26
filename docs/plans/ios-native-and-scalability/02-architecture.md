# iOS Native & Scalability — Gate 2 Architecture (Path C: HTTPS + PWA Hardening)

**Decision (user-approved):** Path C — make the deployed PWA fully functional on iOS
(HTTPS → geolocation + web push), fix the discovered realtime breakage, add
horizontal-scale readiness. Capacitor (Path A) stays deferred.

---

## Gate 0 addendum — CRITICAL finding discovered during Gate 2 groundwork

**Realtime is broken in production right now.** Empirical proof (live probe,
`scripts/ws-namespace-probe.mjs`):

```
http://100.93.99.24:3001/lobby        -> CONNECTED (namespace accepted)
http://100.93.99.24:3001/api/v1/lobby -> connect_error: Invalid namespace
```

- All 4 socket call sites (`useMessages`, `useMatches`, `useConversations`,
  `NotificationProvider`) do `` io(`${NEXT_PUBLIC_API_URL}/lobby`) ``. With
  `NEXT_PUBLIC_API_URL=http://100.93.99.24:3001/api/v1` the client computes
  namespace **`/api/v1/lobby`** (socket.io uses the URL pathname as the
  namespace; engine.io always hits `<origin>/socket.io`).
- The gateway registers namespace **`/lobby`** (`@WebSocketGateway({ namespace:
  '/lobby' })`), so the handshake is rejected: live chat updates, live match
  updates, and live notifications never arrive. Flows only appear to work via
  optimistic send + React Query refetch.
- Confirmed in the deployed bundle (`.next/static/chunks/8339-…js`):
  `io("".concat(NEXT_PUBLIC_API_URL ?? "","/lobby"))` — the full `/api/v1`
  base is inlined.

**Fix (part of Slice 1):** derive the socket **origin** from
`NEXT_PUBLIC_API_URL` (`new URL(...).origin`) and connect to
`<origin>/lobby`. Works unchanged for HTTP, HTTPS, and any future host swap.

---

## Infra ground truth (verified this session)

| Fact | Status |
|---|---|
| `sudo -n true` | **works** — the old blocker (`docs/plans/social-discovery/04-https-prerequisite.md`) is resolved |
| `tailscale serve` | **already live**: `https://aa.tail2948f9.ts.net` → `http://localhost:3000` (PWA on 443, tailnet-only) |
| API proxy | NOT configured — `:3001` HTTP only → geolocation/push blocked for PWA pages served over HTTPS unless API is also HTTPS |
| CSP `connect-src` | derived dynamically from `NEXT_PUBLIC_API_URL` in `next.config.mjs` + `ws:`/`wss:` already allowed → **no CSP code change needed** |
| Cookie SameSite | PWA `:443` and API `:8443` share the host `aa.tail2948f9.ts.net` → **same-site** (SameSite ignores port) → Lax cookies flow; Bearer token remains the primary cross-origin auth |
| Gateway WS origin allowlist | validated at connect time from ConfigService (`PLAYER_URL`/`ADMIN_URL`) — must include the HTTPS PWA origin |

## Architecture choice: Option A (two origins) over Option B (single-origin rewrite)

Option B (Next rewrites `/api/*` → `:3001`) cannot cleanly proxy the
WebSocket upgrade for `/socket.io`, and Next's WS-proxy behavior in
standalone mode is version-dependent. Option A keeps socket.io direct to the
API origin (only REST goes nowhere near a proxy) at the cost of one extra
tailscale serve line.

```
iPhone (installed PWA)
  │  https://aa.tail2948f9.ts.net            (443, tailscale serve → :3000)
  │      pages, SW, manifest — SECURE CONTEXT ✓ geolocation ✓ web push ✓
  │
  ├─ REST  https://aa.tail2948f9.ts.net:8443/api/v1/...   → :3001 (Nest)
  └─ WSS   wss://aa.tail2948f9.ts.net:8443/socket.io  nsp /lobby → :3001 (gateway)
```

---

## Component changes

### Slice 1 — HTTPS cutover + socket namespace fix (P0)

| File | Change | Why |
|---|---|---|
| VPS (ops) | `sudo tailscale serve --bg --https=8443 http://localhost:3001` | HTTPS API origin for secure-context pages |
| `apps/api/.env` | `PLAYER_URL` += `https://aa.tail2948f9.ts.net` | CORS + WS origin allowlist for the HTTPS PWA |
| `apps/player-pwa/src/lib/socket.ts` **(NEW)** | `socketBaseUrl()`: `new URL(env.NEXT_PUBLIC_API_URL).origin` + shared `io()` options factory (path `/socket.io`, transports, auth token from localStorage, reconnection) | Single source of truth; fixes the `/api/v1/lobby` invalid-namespace breakage; dedupes 4 copy-pasted option blocks |
| `useMessages.ts`, `useMatches.ts`, `useConversations.ts`, `NotificationProvider.tsx` | Use `socketBaseUrl()` + shared options | Same |
| `apps/player-pwa/.env.local` | `NEXT_PUBLIC_API_URL=https://aa.tail2948f9.ts.net:8443/api/v1` | Secure-context API access |
| — | `npx turbo run build --force` + sync-standalone + restarts | `NEXT_PUBLIC_*` is baked at build time (turbo cache ships stale env) |
| Device | Reinstall PWA (origin changed) | SW + manifest are origin-scoped |

**Verification (all must show real output):**
1. `node scripts/ws-namespace-probe.mjs` rewritten for `https://…:8443` — `/lobby` CONNECTED over wss.
2. Browser on Mac/iPhone over HTTPS: geolocation permission prompt → feed shows distances, nearest-first sort.
3. Two browser sessions in one match: message appears live (no refetch) — proves namespace fix end-to-end.
4. `npx vitest run` (PWA) + `npm test` (API) green.

### Slice 2 — iOS web push verification (P0)

- Requires installed-to-home-screen PWA on iOS ≥ 16.4 (already have
  apple-mobile-web-app meta + push handlers in `worker/index.js`).
- Trigger a notification-producing action (admin action notify / match event)
  and confirm delivery to a locked-screen device.
- If APNs-style delay appears (iOS throttles web push), document it; do not
  code around it yet.

### Slice 3 — Redis adapter for socket.io (P1, horizontal scale)

- `apps/api/src/modules/gateway/gateway.module.ts` (or `app.gateway.ts`
  `afterInit`): `REDIS_URL` set ⇒ `server.adapter(createAdapter(pub, sub))`
  with `redis`/`ioredis` clients; unset ⇒ in-memory (dev unchanged, zero new
  required config).
- No Redis on the VPS yet — the adapter is dormant until `REDIS_URL` exists.
- Jest: gateway init test for both branches (mock clients).

### Slice 4 — media storage decision record (P1, no code)

- Add `docs/plans/social-discovery/05-media-storage.md`: S3-compatible bucket
  (R2 vs S3 tradeoff for Saudi latency/egress), presigned-upload endpoint
  shape, CDN `next/image` loader. Locks the contract BEFORE any media slice.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Tailscale cert expiry/renewal | `tailscale serve` auto-renews via the node's tailnet certs; nothing to do — noted for ops |
| Stale SW keeps old API base on devices | Origin changes with HTTPS → full reinstall required anyway; release notes step |
| `NEXT_PUBLIC_APP_URL` default (`https://app.koralink.sa`) not live — share links | Out of scope; set `NEXT_PUBLIC_APP_URL=https://aa.tail2948f9.ts.net` in Slice 1 env pass (build-time only) |
| Cookie `Secure` flag vs HTTPS | Verify cookie options in `auth.controller` during Slice 1; Bearer path is primary — cookie is convenience |
| WS through `:8443` blocked by middleboxes | Tailnet-only traffic; not a public path |

## Descoped

- Next.js Middleware location routing (single-region; PostGIS does the work).
- Serwist migration, Supabase/Firebase realtime migration (already correct).
- Capacitor Path A (deferred until App Store requirement).
- Any multi-region/CDN work.
