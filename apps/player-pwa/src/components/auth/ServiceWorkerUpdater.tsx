'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { captureError, trackEvent } from '@/providers/ObservabilityProvider';
import Portal from '@/components/layout/Portal';

/** sessionStorage key — set when the user taps "Later"; suppresses the banner for the session. */
const SW_UPDATE_DISMISSED_KEY = 'swUpdateDismissed';

type SkipWaitingTarget = Pick<ServiceWorker, 'postMessage'> & { scriptURL?: string };

function isDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(SW_UPDATE_DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Consent-gated service-worker updates (P2-126, run #89).
 *
 * A mid-session deploy must NEVER reload the app under the user (form/draft
 * loss). The built sw.js no longer calls `self.skipWaiting()` unconditionally
 * (`workboxOptions.skipWaiting: false`); a new worker stays WAITING until the
 * page posts `{ type: 'SKIP_WAITING' }` (listener in worker/index.js).
 * `clientsClaim` stays on — claiming on activation is fine, activation itself
 * is the consented step.
 *
 * State machine:
 *   - Page already controlled + a worker is waiting (found on `ready`, or a
 *     freshly-installed worker via `updatefound`) → show the "Update ready"
 *     banner. Nothing is posted automatically.
 *   - "Reload now" → post SKIP_WAITING to the waiting worker, mark explicit
 *     consent; the resulting `controllerchange` reloads once.
 *   - "Later" → hide + `sessionStorage[swUpdateDismissed]`; not re-shown this
 *     session (checked on mount).
 *   - No controller (first install / uncontrolled page) → post SKIP_WAITING
 *     immediately, no banner. A plain first claim does NOT reload. Only when
 *     an UPDATE (`updatefound` after `ready`) is activated for a page that
 *     started uncontrolled (`pendingAdopt`) does the adopting
 *     `controllerchange` reload once — stale page + new SW = old chunk refs
 *     may 404 (`ChunkLoadError`).
 *   - `controllerchange` without consent on a page that had a controller
 *     from the start (another tab consented) → no reload.
 *
 * P2-60 (run #50): this component ALSO owns the `/sw.js` registration call —
 * next-pwa's injected `register: true` script lets failures escape as
 * UNHANDLED promise rejections (Sentry KORALINK-WEB-2: old browsers and
 * enterprise CSPs blocking the worker). Here a failed registration is
 * captured with scope `swRegister` and the page silently degrades to
 * no-offline support instead of erroring.
 */
export default function ServiceWorkerUpdater() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<SkipWaitingTarget | null>(null);
  const consentRef = useRef(false);

  useEffect(() => {
    // P2-60 (run #50): truthiness guard (not `in`) — also covers environments
    // where the property exists but is undefined.
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    const priorControllerWasNull = !navigator.serviceWorker.controller;
    let pendingAdopt = false;
    let reloading = false;
    const reloadOnce = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const onControllerChange = () => {
      if (consentRef.current || (pendingAdopt && priorControllerWasNull)) reloadOnce();
    };

    const offerUpdate = (worker: SkipWaitingTarget) => {
      waitingRef.current = worker;
      if (!isDismissed()) setUpdateReady(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Registration with an explicit failure path (P2-60). Update detection
    // below still rides `navigator.serviceWorker.ready`, so this only needs
    // the catch — never an unhandled rejection.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => captureError(err, { scope: 'swRegister' }));

    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg?.waiting) {
          if (navigator.serviceWorker.controller) offerUpdate(reg.waiting);
          // First install / uncontrolled page: activate silently, no reload.
          else reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Watch for a worker installed during this session.
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state !== 'installed') return;
            if (navigator.serviceWorker.controller) {
              offerUpdate(newWorker);
            } else {
              pendingAdopt = true;
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        reg.update().catch(() => {});
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!updateReady) return null;

  const handleReload = () => {
    const worker = waitingRef.current;
    consentRef.current = true;
    trackEvent('pwa_update_reload_clicked');
    setUpdateReady(false);
    if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  };

  const handleLater = () => {
    trackEvent('pwa_update_later_clicked');
    setUpdateReady(false);
    try {
      window.sessionStorage.setItem(SW_UPDATE_DISMISSED_KEY, waitingRef.current?.scriptURL || '1');
    } catch {
      // storage unavailable (private mode) — hide for this mount only
    }
  };

  return <UpdateBanner onReload={handleReload} onLater={handleLater} />;
}

/**
 * Split out so `useTranslations` only runs when the banner actually renders —
 * the updater itself is mounted at the root layout.
 */
function UpdateBanner({ onReload, onLater }: { onReload: () => void; onLater: () => void }) {
  const t = useTranslations('pwa');

  useEffect(() => {
    trackEvent('pwa_update_banner_shown');
  }, []);

  return (
    <Portal>
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md md:max-w-lg mx-auto px-5 z-[60]"
      >
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(32,33,36,0.18)] border border-gray-100 p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-green flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-white" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-brand-black leading-tight">{t('updateReadyTitle')}</h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t('updateReadyBody')}</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={onReload}
                  className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-xs font-bold active:scale-[0.98] transition-transform"
                >
                  {t('updateReload')}
                </button>
                <button
                  type="button"
                  onClick={onLater}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-brand-black text-xs font-bold active:scale-[0.98] transition-transform"
                >
                  {t('updateLater')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
