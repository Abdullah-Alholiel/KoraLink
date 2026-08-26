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
const TOKEN_STORAGE_KEY = 'koralink_token';

/**
 * Shared connection options for every /lobby socket. One source of truth for
 * the option block previously copy-pasted across 4 call sites.
 *
 * @param reconnectionAttempts NotificationProvider uses 10 (long-lived
 *        provider socket); feature hooks use 5.
 */
export function createLobbySocket(reconnectionAttempts = 5): Socket {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem(TOKEN_STORAGE_KEY)
      : null;

  return io(`${socketBaseUrl()}${LOBBY_NAMESPACE}`, {
    path: '/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts,
    reconnectionDelay: 1000,
  });
}
