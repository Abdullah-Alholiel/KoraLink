'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, getToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const WS_BASE = API_URL.replace(/\/api\/v1$/, '');

export type OpsEntity =
  | 'users'
  | 'matches'
  | 'venues'
  | 'disputes'
  | 'transactions'
  | 'settlements'
  | 'settings';

/**
 * Live admin/partner data hook.
 *
 * Fetches on mount, then refetches whenever:
 *  1. the API pushes an `ops-data-changed` ping over the `/lobby` socket
 *     (fired by every mutation that ops consoles display), or
 *  2. the tab regains focus, or
 *  3. a 30s fallback interval elapses (covers missed socket events).
 *
 * `entities` filters socket-driven refreshes to the entities a page renders
 * (a `users` ping won't refetch the transactions table).
 */
export function useLiveAdminData<T>(
  path: string,
  entities: OpsEntity[] = [],
  options?: { pollMs?: number },
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Live socket refresh ──
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket: Socket = io(`${WS_BASE}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('ops-data-changed', (payload: { entity: OpsEntity }) => {
      const wanted = entitiesRef.current;
      if (wanted.length === 0 || wanted.includes(payload.entity)) {
        reload();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [reload]);

  // ── Focus + interval fallbacks ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const interval = window.setInterval(
      reload,
      options?.pollMs ?? 30_000,
    );

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(interval);
    };
  }, [reload, options?.pollMs]);

  return { data, error, loading, reload, live };
}
