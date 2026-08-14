'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, X } from 'lucide-react';
import {
  useGeolocation,
  type GeoCoords,
  type GeoStatus,
} from '@/hooks/useGeolocation';
import { fetcher } from '@/lib/fetcher';
import { selectUser, useAppStore } from '@/store/useAppStore';

interface LocationContextValue {
  coords: GeoCoords | null;
  status: GeoStatus;
  request: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

/** Read the shared location state. Falls back to a no-op default when the
 *  provider is not mounted (e.g. isolated tests). */
export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    return { coords: null, status: 'idle', request: () => {} };
  }
  return ctx;
}

/**
 * Provides geolocation state app-wide and renders a dismissible permission
 * banner when the user has not granted (or has denied) location.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { coords, status, request } = useGeolocation();
  const [dismissed, setDismissed] = useState(false);
  const storeUser = useAppStore(selectUser);

  const value = useMemo(
    () => ({ coords, status, request }),
    [coords, status, request],
  );

  // Persist the last-known location to the profile (best-effort, fire-and-forget).
  // Fires when a fresh fix arrives OR when auth resolves after a cached fix.
  useEffect(() => {
    if (coords && storeUser?.id) {
      fetcher('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ home_lat: coords.lat, home_lng: coords.lng }),
      }).catch(() => undefined);
    }
  }, [coords, storeUser?.id]);

  const showPrompt = status === 'idle' && !dismissed;
  const showDenied = status === 'denied' && !coords && !dismissed;

  return (
    <LocationContext.Provider value={value}>
      {children}
      {(showPrompt || showDenied) && (
        <div className="fixed inset-x-0 top-0 z-[80] max-w-md mx-auto pointer-events-none">
          <div className="mx-4 mt-[var(--top-safe-inset)] bg-brand-green text-white rounded-2xl shadow-[0_8px_30px_rgba(37,65,50,0.35)] px-4 py-3 flex items-center gap-3 pointer-events-auto">
            <MapPin className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">
                {t('location.permissionTitle')}
              </p>
              <p className="text-xs opacity-90">
                {showPrompt
                  ? t('location.permissionBody')
                  : t('location.denied')}
              </p>
            </div>
            <button
              onClick={request}
              className="shrink-0 bg-white text-brand-green text-xs font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
            >
              {t('location.enable')}
            </button>
            <button
              onClick={() => setDismissed(true)}
              aria-label={t('location.later')}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 active:scale-95 transition-transform"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </LocationContext.Provider>
  );
}
