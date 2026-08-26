# iOS Native & Scalability — Gate 3 Program Design (Path C)

Exact contracts. No implementation until this gate is approved.

---

## 1. `apps/player-pwa/src/lib/socket.ts` (NEW) — socket factory contract

```typescript
import type { Socket } from 'socket.io-client';

/** Namespace the API gateway registers (@WebSocketGateway({ namespace: '/lobby' })). */
export const LOBBY_NAMESPACE = '/lobby';

/**
 * ORIGIN of the API, derived from NEXT_PUBLIC_API_URL by stripping any path.
 * socket.io treats the URL *pathname* as the namespace while engine.io always
 * connects to `<origin>/socket.io` — so a pathful base (`…:3001/api/v1`)
 * MUST be reduced to its origin before appending `/lobby`.
 * Falls back to 'http://localhost:3001' when the env var is unset/unparseable
 * (jsdom tests, local dev without .env.local).
 */
export function socketBaseUrl(): string;

/**
 * Shared connection options for every /lobby socket.
 * @param reconnectionAttempts  NotificationProvider uses 10; hooks use 5.
 */
export function createLobbySocket(reconnectionAttempts?: number): Socket;
// Behavior (identical to today's inline options, minus the URL bug):
//   io(`${socketBaseUrl()}/lobby`, {
//     path: '/socket.io',
//     transports: ['websocket'],
//     withCredentials: true,
//     auth: token ? { token } : undefined,   // token from localStorage 'koralink_token'
//     reconnection: true,
//     reconnectionAttempts,                  // default 5
//     reconnectionDelay: 1000,
//   });
```

**Call-site migration (4 sites, no behavior change beyond the URL fix):**

| File | Line (current) | Becomes |
|---|---|---|
| `src/hooks/useMessages.ts` | 160 | `const socket = createLobbySocket(5);` |
| `src/hooks/useMatches.ts` | 112 | `const socket = createLobbySocket(5);` |
| `src/hooks/useConversations.ts` | 185 | `const socket = createLobbySocket(5);` |
| `src/providers/NotificationProvider.tsx` | 56 | `const socket = createLobbySocket(10);` |

## 2. Environment contract

| Var | File | Before | After (Slice 1) |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `apps/player-pwa/.env.local` | `http://100.93.99.24:3001/api/v1` | `https://aa.tail2948f9.ts.net:8443/api/v1` |
| `NEXT_PUBLIC_APP_URL` | `apps/player-pwa/.env.local` | (unset → default `https://app.koralink.sa`) | `https://aa.tail2948f9.ts.net` |
| `PLAYER_URL` | `apps/api/.env` | `http://localhost:3000,http://100.93.99.24:3000` | append `,https://aa.tail2948f9.ts.net` (keep existing entries) |
| `NODE_ENV` (API) | `apps/api/.env` | `development` | **unchanged** — tailnet deployment stays dev-mode (body token for Bearer, lax cookies) |

CSP needs NO code change: `connect-src` is derived from `NEXT_PUBLIC_API_URL`
at build time and `ws:`/`wss:` are already allowed. `NEXT_PUBLIC_*` changes
require `npx turbo run build --force` (turbo cache ships stale env).

## 3. Ops contract (Slice 1, run on VPS)

```bash
sudo tailscale serve --bg --https=8443 http://localhost:3001
# API .env: append HTTPS origin to PLAYER_URL; restart koralink-api
# PWA: npx turbo run build --force (from root, with new .env.local) → sync-standalone auto-restarts
# Device: delete + re-add home-screen PWA (origin changed → old SW is orphaned)
```

## 4. Redis adapter contract (Slice 3, API)

```typescript
// app.gateway.ts :: afterInit(server?: Server)
// REDIS_URL set   → createAdapter(pubClient, subClient) via `redis` v4 duplicate()
// REDIS_URL unset → no adapter (in-memory default; dev unchanged, no new required config)
// Failure mode: if client creation throws at boot, LOG and CONTINUE in-memory
// (realtime degrades to single-instance rather than taking the API down).
```

Deps: `@socket.io/redis-adapter` + `redis` (API only). No Redis server install
this cycle — adapter is dormant until `REDIS_URL` exists.

## 5. Test contract

| Test | Runner | Asserts |
|---|---|---|
| `apps/player-pwa/test/lib/socket.test.ts` (NEW) | vitest | `socketBaseUrl()` strips `/api/v1` (http + https + custom port + trailing slash); fallback to `http://localhost:3001` on unset/garbage; `createLobbySocket(10)` builds `/lobby` URL with `path:'/socket.io'`, `transports:['websocket']`, `withCredentials:true`, `auth.token` from localStorage, attempt count honored |
| `apps/api/src/modules/gateway/app.gateway.spec.ts` (extend) | jest | `afterInit` with no `REDIS_URL` registers server, no adapter; with `REDIS_URL` set and mocked clients, adapter attached; client-creation failure logs + continues |
| Existing suites | both | 208 PWA + 15 API stay green |

## 6. i18n contract

None — no new user-facing strings. (Slice 2 push verification uses existing
push prompt copy; Slice 4 is a decision doc.)

## 7. Contract verification checklist (Gate 3 → 4)

- [x] Every mutation endpoint touched: none (no API DTO/service changes in Slices 1–2; Slice 3 touches gateway init only, no endpoints)
- [x] Frontend types can accept backend JSON: unchanged shapes — socket factory changes URL derivation only, event payloads identical
- [x] Adapter functions exist for every consumed API shape: no new API shapes
- [x] No field silently undefined: N/A (no schema/DTO changes)
- [x] i18n keys for every new user-facing string: zero new strings
- [x] Namespace contract verified empirically: `/lobby` CONNECTED vs `/api/v1/lobby` Invalid namespace (`scripts/ws-namespace-probe.mjs`, 2026-08-26)
- [x] Same-site cookie flow verified: PWA `:443` and API `:8443` share host → SameSite ignores port → Lax cookies flow; Bearer remains primary
