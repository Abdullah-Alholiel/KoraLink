'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetcher } from '@/lib/fetcher';

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

export function usePushNotifications(locale: string = 'en') {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Check current permission and subscription on mount
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }

    setPermission(Notification.permission);

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then(setSubscription);
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return false;

    setIsSubscribing(true);
    try {
      const granted = await requestPermission();
      if (!granted) return false;

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

      return true;
    } catch (err) {
      console.error('[Push] Failed to subscribe:', err);
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [requestPermission, locale]);

  const unsubscribe = useCallback(async () => {
    try {
      if (subscription) {
        await fetcher('/notifications/unsubscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
        setSubscription(null);
      }
    } catch (err) {
      console.error('[Push] Failed to unsubscribe:', err);
    }
  }, [subscription]);

  return {
    permission,
    isSubscribed: !!subscription,
    isSubscribing,
    subscribe,
    unsubscribe,
    isSupported:
      typeof window !== 'undefined' &&
      'Notification' in window &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator,
  };
}
