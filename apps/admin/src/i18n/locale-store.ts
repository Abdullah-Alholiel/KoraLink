import { useSyncExternalStore } from 'react';
import {
  applyDocumentLocale,
  getStoredLocale,
  storeLocale,
  type AdminLocale,
} from '@/i18n/config';

/**
 * Module-level locale store with subscribe/notify so every consuming
 * component re-renders on switch (useSyncExternalStore keeps snapshots
 * referentially stable — no tearing during concurrent render).
 */
let current: AdminLocale = 'en';
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): AdminLocale {
  return current;
}

function getServerSnapshot(): AdminLocale {
  return 'en';
}

/** Sync the store from localStorage — call once on client mount. */
export function initAdminLocale(): void {
  const stored = getStoredLocale();
  if (stored !== current) {
    current = stored;
    emit();
  }
  applyDocumentLocale(current);
}

/** Switch the locale: updates the store, persists, and flips <html lang/dir>. */
export function setAdminLocale(locale: AdminLocale): void {
  if (locale === current) {
    applyDocumentLocale(locale);
    return;
  }
  current = locale;
  storeLocale(locale);
  applyDocumentLocale(locale);
  emit();
}

/** Reactive admin locale ('en' during SSR and before first init). */
export function useAdminLocale(): AdminLocale {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
