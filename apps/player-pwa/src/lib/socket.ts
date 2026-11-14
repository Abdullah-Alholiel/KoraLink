import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { env } from '@/env.mjs';

/**
 * Namespace the API gateway registers
 * (`@WebSocketGateway({ namespace: '/lobby' })` — apps/api/src/modules/gateway/app.gateway.ts).
 */
export const LOBBY_NAMESPACE = '/lobby';

/**
 * Origin of the API, derived from NEXT_PUBLIC_API_URL by stripping any path.
 *
 * socket.io treats the URL *pathname* as the namespace while engine.io always
 * connects to `<origin>/socket.io`. Appending `/lobby` to a pathful base
 * (`…:3001/api/v1`) therefore targets the nonexistent namespace
 * `/api/v1/lobby` — the gateway rejects the handshake with
 * "Invalid namespace" and realtime silently dies (chat/match/notification
 * events never arrive; flows only coast on optimistic send + refetch).
 * Proven live 2026-08-26 via scripts/ws-namespace-probe.mjs.
 *
 * Falls back to `http://localhost:3001` when the env var is unset or
 * unparseable (jsdom tests, local dev without .env.local).
 */
export function socketBaseUrl(): string {
  const raw = env.NEXT_PUBLIC_API_URL ?? '';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

/** localStorage key holding the dev-login/OTP-verify Bearer token. */
export const TOKEN_STORAGE_KEY = 'koralink_token';

/**
 * True when the current page origin is SAME-SITE with the socket origin
 * (equal scheme + hostname; differing ports are still same-site — "site"
 * ignores ports, which is what makes the staging PWA :9450/:10000 ↔ API
 * :8443 pair same-site on the shared Tailscale hostname).
 *
 * This is the P2-240 decision gate: on a same-site deployment the API's
 * httpOnly `access_token` cookie automatically rides the engine.io
 * handshake (`withCredentials: true`) and authenticates it — so the JWT
 * must NOT also be attached as `auth.token`, which would hand every XSS a
 * readable credential again. On cross-site topologies the cookie cannot
 * reach the API at all (SameSite=strict in prod; third-party cookie
 * storage blocked — the documented P2-11 reason the body-token exception
 * exists), so the localStorage fallback stays ONLY there.
 */
export function isSameSiteSocketOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const page = new URL(window.location.href);
    const sock = new URL(socketBaseUrl());
    return page.protocol === sock.protocol && page.hostname === sock.hostname;
  } catch {
    return false;
  }
}

/**
 * Handshake `auth` payload under the P2-240 policy:
 * - same-site → `undefined` (cookie-only; nothing XSS-readable is stored);
 * - cross-site → the localStorage Bearer token when present (the cookie
 *   physically cannot ride), else `undefined` (unauthenticated handshake —
 *   the gateway rejects it, same as a logged-out user today).
 */
export function buildSocketAuth(): { token: string } | undefined {
  if (isSameSiteSocketOrigin()) return undefined;
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem(TOKEN_STORAGE_KEY)
      : null;
  return token ? { token } : undefined;
}

/**
 * Shared connection options for every /lobby socket. One source of truth for
 * the option block previously copy-pasted across 4 call sites.
 *
 * Auth (P2-240): same-site origins authenticate via the httpOnly cookie on
 * the handshake (`withCredentials: true`) — no localStorage token is read.
 * Cross-site origins fall back to the stored Bearer token. See
 * `buildSocketAuth()`.
 *
 * @param reconnectionAttempts NotificationProvider uses 10 (long-lived
 *        provider socket); feature hooks use 5.
 */
export function createLobbySocket(reconnectionAttempts = 5): Socket {
  return io(`${socketBaseUrl()}${LOBBY_NAMESPACE}`, {
    path: '/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    auth: buildSocketAuth(),
    reconnection: true,
    reconnectionAttempts,
    reconnectionDelay: 1000,
  });
}
