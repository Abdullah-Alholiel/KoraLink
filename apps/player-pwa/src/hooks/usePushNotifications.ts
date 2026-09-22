'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetcher } from '@/lib/fetcher';
import { captureError } from '@/providers/ObservabilityProvider';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Public VAPID key — this is safe to expose (it's the public key)
const VAPID_PUBLIC_KEY =
  'BEl62iUYgU4x0mQDmvYFz9xSYmIqtrmHQ0IKcJqH2m5RjNK0QPlZcR-JxpjMQm4oBmSmmCm8FzWcMjQBjNt2jJc';

/**
 * P2-91 (run #69): WHY a subscribe attempt did not produce a subscription.
 * `false` collapsed three fixable-but-different failures into one, and the
 * only consumer told every failure "install the PWA" — a dead end for a user
 * whose real problem is a denied browser permission (they must re-enable it
 * in browser settings, not install anything).
 */
export type PushSubscribeOutcome =
  | 'ok'
  | 'not-installed'
  | 'permission-denied'
  | 'error';

export function usePushNotifications(locale: string = 'en') {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  // P2-87 (run #67): pending state for the OFF switch — the profile toggle
  // previously had no way to disable itself while the unsubscribe POST was in
  // flight (double-tap guard) and no error contract to react to.
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);

  // Check current permission and subscription on mount
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }

    setPermission(Notification.permission);

    navigator.serviceWorker.ready
      .then((reg) => {
        reg.pushManager.getSubscription().then(setSubscription);
      })
      .catch(() => {
        // P2-91 (run #69): a rejecting serviceWorker.ready (SW registration
        // torn down mid-boot, browser quirks) must not surface as an
        // unhandled rejection from the mount effect — subscribe() already
        // reports 'error' through its own try/catch.
      });
  }, []);

  // P2-76b (run #65): keep the server-side push locale in sync with the UI
  // locale. push_subscriptions.locale is set at subscribe time only, so a
  // user who switches ar/en would keep receiving pushes in the OLD language.
  // Locale switches are URL-driven (/ar/... <-> /en/...) and remount this
  // hook, so a prev-value ref would never observe the change — persist a
  // last-synced marker in localStorage instead and re-upsert when it drifts.
  // The subscribe endpoint is an idempotent upsert on endpoint, so this is
  // a cheap metadata refresh, never a duplicate row. POST bodies always
  // reach the server (unlike the old DELETE unsubscribe — P2-76a).
  useEffect(() => {
    if (!subscription) return;
    if (typeof window === 'undefined') return;
    const markerKey = 'kl.push.syncedLocale';
    let marker: string | null = null;
    try {
      marker = window.localStorage.getItem(markerKey);
    } catch {
      // storage unavailable (private mode) — treat as never-synced
    }
    if (marker === locale) return;
    (async () => {
      try {
        const sub = subscription.toJSON();
        await fetcher('/notifications/subscribe', {
          method: 'POST',
          body: JSON.stringify({ ...sub, locale }),
        });
        try {
          window.localStorage.setItem(markerKey, locale);
        } catch {
          // non-fatal — worst case we re-upsert next mount
        }
      } catch (err) {
        // P2-16: ship to Sentry; a missed locale sync must not look like a
        // failed subscription (the push sub itself is still valid).
        captureError(err, { scope: 'pushLocaleSync' });
      }
    })();
  }, [subscription, locale]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  /**
   * P2-91 (run #69): returns WHY the attempt did not end subscribed —
   * 'not-installed' (iOS standalone contract), 'permission-denied'
   * (browser permission refused or revoked since), or 'error' (SW/push
   * manager/POST failure — already shipped to Sentry). Previously a bare
   * `false` for all three; the caller could not tell a user what to do
   * next and showed "install the app" for every failure.
   */
  const subscribe = useCallback(async (): Promise<PushSubscribeOutcome> => {
    if (!('serviceWorker' in navigator)) return 'not-installed';

    setIsSubscribing(true);
    try {
      // P0.5 (run #28): iOS Safari only delivers web push to installed PWAs
      // (system contract — `display-mode: standalone` OR the iOS
      // `navigator.standalone` flag). Asking for permission before install
      // lets the user deny a request that would have been silent anyway,
      // and creates a poor first impression. Surface a localized hint and
      // return false; the profile UI can pick it up and show the install
      // prompt. `mounted` guards the SSR window.
      if (typeof window === 'undefined') return 'not-installed';
      const isStandalone =
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        // iOS Safari exposes `navigator.standalone` as a boolean.
        // Navigator isn't always defined during SSR hydration.
        (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true);
      if (!isStandalone) {
        // No exception — the user is just not in the installed surface yet.
        // The profile UI surfaces `common.installRequired` if the consumer
        // wants to show a hint.
        return 'not-installed';
      }

      const granted = await requestPermission();
      // P2-91: distinguish a REFUSED permission prompt (user tapped "Block",
      // or the stored permission was already 'denied') from the other
      // failure modes — recovery is browser settings, not an install.
      if (!granted) return 'permission-denied';

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setSubscription(sub);

      // Send to backend, including the active locale so push deep-links
      // preserve ar/en (P1-5).
      await fetcher('/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({ ...sub.toJSON(), locale }),
      });
      // P2-76b: remember the synced locale so the locale-sync effect doesn't
      // immediately re-upsert the identical payload.
      try {
        window.localStorage.setItem('kl.push.syncedLocale', locale);
      } catch {
        // non-fatal
      }

      return 'ok';
    } catch (err) {
      // P2-16: ship to Sentry (console kept for local dev visibility).
      captureError(err, { scope: 'pushSubscribe' });
      console.error('[Push] Failed to subscribe:', err);
      return 'error';
    } finally {
      setIsSubscribing(false);
    }
  }, [requestPermission, locale]);

  // P2-87 (run #67): resolves TRUE on success, FALSE on failure. Failure
  // already ships to Sentry (captureError below) — the boolean return lets
  // the caller surface localized feedback without re-implementing the try/
  // catch (was: silent void promise; user believed pushes were off while
  // the server kept the subscription).
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsUnsubscribing(true);
    try {
      if (subscription) {
        // P2-76 (run #65): POST, not DELETE — some proxies/clients drop
        // DELETE request bodies, which silently no-op'd the unsubscribe
        // (scoped delete matched nothing → user keeps receiving pushes).
        // The server keeps a deprecated DELETE dual-route for old bundles.
        await fetcher('/notifications/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
        setSubscription(null);
        // P2-76b: the server row is gone — drop the locale-sync marker so a
        // future re-subscribe re-seeds it cleanly.
        try {
          window.localStorage.removeItem('kl.push.syncedLocale');
        } catch {
          // non-fatal
        }
      }
      // No active subscription = nothing to unsubscribe; still a success.
      return true;
    } catch (err) {
      // P2-16: ship to Sentry (console kept for local dev visibility).
      captureError(err, { scope: 'pushUnsubscribe' });
      console.error('[Push] Failed to unsubscribe:', err);
      // P2-87 (run #67): the caller decides how to tell the user — the hook
      // only owns the outcome contract (see 01-program-design.md Gate 3).
      return false;
    } finally {
      setIsUnsubscribing(false);
    }
  }, [subscription]);

  return {
    permission,
    isSubscribed: !!subscription,
    isSubscribing,
    isUnsubscribing,
    subscribe,
    unsubscribe,
    isSupported:
      typeof window !== 'undefined' &&
      'Notification' in window &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator,
  };
}
