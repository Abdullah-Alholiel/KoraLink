'use client';

/**
 * P0-2 (run #169) — Moyasar 3DS redirect callback.
 *
 * Challenge-based 3DS full-page-redirects the browser to
 * /<locale>/wallet/topup/callback?id=<paymentId>. On return the PWA boots
 * fresh on this route; the intent id (pinned before the form initialized)
 * rides sessionStorage (same tab survives the redirect round-trip). Missing
 * intent context → localized failure state directing the player to retry
 * from the wallet — CONSERVATIVE: money is never credited without the
 * server-side ownership pin (the pending intent simply expires uncredited).
 *
 * Verification authority is the SAME endpoint as the in-place flow:
 * POST /wallet/topup/verify re-fetches the payment from Moyasar (sk) — the
 * redirect itself is a hint, never proof of payment.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { captureError, trackEvent } from '@/providers/ObservabilityProvider';
import { useVerifyTopup } from '@/hooks/useTopup';
import { TOPUP_INTENT_SESSION_KEY, TOPUP_PAYMENT_SESSION_KEY } from '@/lib/topup';

type Phase = 'verifying' | 'success' | 'failed';

function CallbackInner() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyTopup = useVerifyTopup();
  const [phase, setPhase] = useState<Phase>('verifying');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const paymentId = searchParams.get('id');
    const intentId =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem(TOPUP_INTENT_SESSION_KEY)
        : null;

    if (!paymentId || !intentId) {
      // PR-Agent r1 MINOR: sessionStorage is NOT cleared here anymore — the
      // ids survive a refresh so the verify can be retried (a refresh used
      // to orphan a possibly-charged payment behind missing-context). They
      // are cleared only after a definitive outcome below.
      captureError(new Error('topup callback missing context'), {
        area: 'wallet-topup-callback',
        hasPaymentId: Boolean(paymentId),
        hasIntentId: Boolean(intentId),
      });
      setPhase('failed');
      trackEvent('topup_callback_result', { ok: false, reason: 'missing-context' });
      return;
    }

    verifyTopup.mutate(
      { paymentId, intentId },
      {
        onSuccess: (res) => {
          window.sessionStorage.removeItem(TOPUP_INTENT_SESSION_KEY);
          window.sessionStorage.removeItem(TOPUP_PAYMENT_SESSION_KEY);
          setPhase(res.credited || res.alreadyCredited ? 'success' : 'failed');
          trackEvent('topup_callback_result', {
            ok: res.credited || res.alreadyCredited,
            alreadyCredited: res.alreadyCredited,
            amountSar: res.amountSar,
          });
        },
        onError: (err: unknown) => {
          captureError(err, { area: 'wallet-topup-callback' });
          setPhase('failed');
          trackEvent('topup_callback_result', { ok: false, reason: 'verify-error' });
        },
      },
    );
  }, [searchParams, verifyTopup]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-sm text-center">
        {phase === 'verifying' && (
          <div role="status">
            <Loader2 className="w-10 h-10 text-brand-black animate-spin mx-auto" aria-hidden />
            <p className="mt-4 text-base font-semibold text-brand-black">{t('wallet.topup.callbackVerifying')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('wallet.topup.secureNote')}</p>
          </div>
        )}
        {phase === 'success' && (
          <div role="status">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" aria-hidden />
            <p className="mt-4 text-base font-bold text-brand-black">{t('wallet.topup.callbackSuccess')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('wallet.topup.successBody')}</p>
            <button
              type="button"
              onClick={() => router.replace('/wallet')}
              className="mt-6 w-full rounded-full bg-brand-black py-3.5 text-base font-semibold text-white"
            >
              {t('wallet.topup.backToWallet')}
            </button>
          </div>
        )}
        {phase === 'failed' && (
          <div role="status">
            <XCircle className="w-12 h-12 text-red-500 mx-auto" aria-hidden />
            <p className="mt-4 text-base font-bold text-brand-black">{t('wallet.topup.callbackFailed')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('wallet.topup.notPaid')}</p>
            <button
              type="button"
              onClick={() => router.replace('/wallet')}
              className="mt-6 w-full rounded-full bg-brand-black py-3.5 text-base font-semibold text-white"
            >
              {t('wallet.topup.backToWallet')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TopupCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
