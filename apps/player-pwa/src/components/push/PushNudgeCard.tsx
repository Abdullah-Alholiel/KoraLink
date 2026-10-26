'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BellRing, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { usePushNotifications, type PushSubscribeOutcome } from '@/hooks/usePushNotifications';
import { trackEvent } from '@/providers/ObservabilityProvider';

/**
 * P2-258 (run #167): one-time contextual push opt-in, offered right AFTER a
 * booking succeeds (join / paid join / host publish — see armPushNudge()).
 *
 * Contract:
 * - Shown ONLY while a booking-success timestamp is fresh (10 min window)
 *   and push is not already subscribed.
 * - One dismissal = 24h cooldown (localStorage marker); subscribed never
 *   re-offered. The profile toggle stays the ever-present fallback.
 * - Outcome copy follows the error-message standard (what happened + why +
 *   what to do next), localized EN+AR via common.push* keys.
 * - This card NEVER fires the browser prompt on its own — the user taps
 *   "Turn on" first (permission prompts without user gesture are dropped).
 */

const NUDGE_WINDOW_MS = 10 * 60_000;
const DISMISS_KEY = 'kl.push.nudgeDismissedAt';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60_000;

function readDismissedAt(): number {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export default function PushNudgeCard() {
  const tCommon = useTranslations('common');
  const t = useTranslations('pushNudge');
  const armedAt = useAppStore((s) => s.pushNudgeArmedAt);
  const disarmPushNudge = useAppStore((s) => s.disarmPushNudge);

  const {
    permission,
    isSubscribed,
    isSubscribing,
    isSupported,
    subscribe,
  } = usePushNotifications();

  // Expired arm timestamps self-disarm (store does not decay on its own).
  const expired = armedAt !== null && Date.now() - armedAt > NUDGE_WINDOW_MS;
  useEffect(() => {
    if (expired) disarmPushNudge();
  }, [expired, disarmPushNudge]);

  // SSR/hydration: gated chrome renders nothing on the server (per
  // references/hydration-conditional-render); mounted flips after first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [dismissed, setDismissed] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const offeredRef = useRef(false);

  if (!mounted || dismissed) return null;
  // Outcome phase: the offer collapses to a compact localized result line
  // (success or what-happened-why-next error) — never just vanish.
  if (outcome) {
    return (
      <div
        role="status"
        data-testid="push-nudge-outcome"
        className="mx-4 mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600"
      >
        {outcome}
      </div>
    );
  }
  if (armedAt === null || expired) return null;
  // Not supported (SSR/old browser), already subscribed, or a past
  // permission decision (granted-without-subscription re-enables in
  // profile; denied re-enables in browser settings — never re-ask).
  if (!isSupported) return null;
  if (isSubscribed || permission === 'denied' || permission === 'granted') return null;
  // 24h cooldown after an explicit dismissal.
  if (readDismissedAt() && Date.now() - readDismissedAt() < DISMISS_COOLDOWN_MS) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage unavailable — dismissal just won't persist
    }
    setDismissed(true);
    disarmPushNudge();
    trackEvent('push_nudge_dismissed', { surface: 'match-page' });
  };

  const turnOn = async () => {
    if (offeredRef.current) return;
    offeredRef.current = true;
    trackEvent('push_nudge_accepted', { surface: 'match-page' });
    const result: PushSubscribeOutcome = await subscribe();
    if (result === 'ok') {
      setOutcome(tCommon('pushNudgeSuccess'));
      disarmPushNudge();
      return;
    }
    // Failure: outcome copy per the error standard (what + why + next).
    setOutcome(
      result === 'not-installed'
        ? tCommon('installRequired')
        : result === 'permission-denied'
          ? tCommon('pushPermissionDenied')
          : result === 'not-configured'
            ? tCommon('pushNotConfigured')
            : tCommon('pushSubscribeFailed'),
    );
  };

  return (
    <div
      role="status"
      data-testid="push-nudge-card"
      className="mx-4 mt-3 rounded-2xl border border-brand-green/20 bg-brand-green/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green/10">
          <BellRing className="h-4.5 w-4.5 text-brand-green" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-brand-black">{t('title')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{t('body')}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={turnOn}
              disabled={isSubscribing}
              className="rounded-full bg-brand-green px-4 py-2 text-xs font-bold text-white active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400"
            >
              {isSubscribing ? t('enabling') : t('enable')}
            </button>
            <button
              onClick={dismiss}
              className="rounded-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600"
            >
              {t('notNow')}
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label={t('dismiss')}
          className="rounded-full p-1 text-gray-300 hover:text-gray-500"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
