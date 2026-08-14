'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoStatus =
  | 'idle'
  | 'prompting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface GeolocationState {
  coords: GeoCoords | null;
  status: GeoStatus;
  error: string | null;
  /** Trigger the permission prompt / a fresh fix. */
  request: () => void;
  /** Re-request a fix without prompting (keeps last-known on failure). */
  refresh: () => void;
}

const CACHE_KEY = 'koralink_last_location';

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

function readCache(): GeoCoords | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number'
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(coords: GeoCoords): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(coords));
  } catch {
    // Storage unavailable (private mode) — non-fatal.
  }
}

/**
 * Wraps `navigator.geolocation` with permission-state tracking and a
 * localStorage cache of the last known fix. Safe to call in any component.
 *
 * NOTE: geolocation requires a secure context (HTTPS or localhost). On plain
 * HTTP (e.g. a raw Tailscale IP) `status` becomes `'unsupported'` and `request`
 * no-ops — callers should degrade gracefully (hide distance, show a hint).
 */
export function useGeolocation(): GeolocationState {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const cachedRef = useRef<GeoCoords | null>(null);

  const applyFix = useCallback((c: GeoCoords) => {
    writeCache(c);
    setCoords(c);
    setStatus('granted');
    setError(null);
  }, []);

  const request = useCallback(() => {
    if (!isSupported()) {
      setStatus('unsupported');
      return;
    }
    setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          const cached = readCache();
          if (cached) {
            setCoords(cached);
            setError(null);
          } else {
            setError('denied');
          }
        } else {
          setStatus('error');
          setError(err.message);
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [applyFix]);

  const refresh = useCallback(() => {
    if (!isSupported()) {
      setStatus('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Keep last-known on failure — silent no-op.
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  }, [applyFix]);

  // Hydrate the cached last-known fix so distance works before a fresh prompt.
  useEffect(() => {
    if (!isSupported()) {
      setStatus('unsupported');
      return;
    }
    const cached = readCache();
    if (cached) {
      cachedRef.current = cached;
      setCoords(cached);
    }
  }, []);

  return { coords, status, error, request, refresh };
}
