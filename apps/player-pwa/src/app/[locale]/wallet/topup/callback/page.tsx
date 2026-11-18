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
 *
 * P2-379 (run #214) — offline is a first-class outcome on this surface: the
 * highest-stakes return moment must never read as an unbounded spinner or a
 * charge-state lie. Offline (at mount or mid-flight) resolves to an explicit
 * offline state with a RETRY affordance — session ids survive, so the verify
 * simply re-runs when connectivity returns. Nothing is cleared on an offline
 * or failed outcome.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, WifiOff, XCircle } from 'lucide-react';

import { captureError, trackEvent } from '@/providers/ObservabilityProvider';
import { useVerifyTopup } from '@/hooks/useTopup';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { topupCallbackMessageKey } from '@/lib/topup-callback-messages';
import { TOPUP_INTENT_SESSION_KEY, TOPUP_PAYMENT_SESSION_KEY } from '@/lib/topup';

type Phase = 'verifying' | 'success' | 'failed';

function CallbackInner() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyTopup = useVerifyTopup();
  const isOnline = useOnlineStatus();
  const [phase, setPhase] = useState<Phase>('verifying');
  // P2-276: failure copy varies by the API verify-rejection code — a charged
  // amount/currency mismatch must NOT say "no money was taken".
  const [failedKey, setFailedKey] = useState<string>('wallet.topup.callbackRetry');
  // P2-379: a retry is offered only when the verify can actually re-run —
  // session ids present (they survive every offline/failed outcome).
  const [canRetry, setCanRetry] = useState(false);
  // P2-379 (PR-Agent r1): set while the verify may still be in flight —
  // the offline watcher must not clobber, and the retry button must not
  // fire, a duplicate request during that window.
  const [inFlight, setInFlight] = useState(false);
  // P2-379 (PR-Agent r1): latched when the UI resolved to the offline state
  // so the doomed fetch's late rejection cannot overwrite it with generic
  // failure copy (the offline state is the truthful one).
  const offlineRef = useRef(false);
  // Bumping this re-runs the verify effect (the retry button's mechanism).
  const [verifyNonce, setVerifyNonce] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    // P2-379: offline while verifying (mount or mid-flight) — resolve to the
    // offline state IMMEDIATELY instead of waiting out the doomed fetch. The
    // offlineRef latch makes the late rejection/late success handlers
    // non-clobbering (PR-Agent r1): onError returns early, onSuccess (a
    // genuinely verified charge) still wins because money-truth outranks UI.
    if (!isOnline && phase === 'verifying') {
      offlineRef.current = true;
      setPhase('failed');
      setFailedKey('wallet.topup.callbackOffline');
      setCanRetry(true);
      return;
    }
  }, [isOnline, phase]);

  useEffect(() => {
    if (startedRef.current) return;
    // P2-379: offline at mount — resolve to the offline state WITHOUT firing
    // a doomed request. PR-Agent r1: startedRef stays FALSE here (the mount
    // effect re-runs when connectivity returns and fires the verify then);
    // canRetry stays false meanwhile so the button can never race that
    // auto-refire into a duplicate request.
    if (!isOnline) {
      offlineRef.current = true;
      setPhase('failed');
      setFailedKey('wallet.topup.callbackOffline');
      setCanRetry(false);
      return;
    }
    startedRef.current = true;
    const paymentId = searchParams.get('id');
    const intentId =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem(TOPUP_INTENT_SESSION_KEY)
        : null;

    // P2-379 (PR-Agent r2): returning from the offline-at-mount state — the
    // auto-refire must clear the stale offline copy FIRST so the spinner is
    // honest, and the offline watcher (gated on phase==='verifying') can
    // catch a SECOND connection drop mid-attempt.
    if (offlineRef.current) {
      offlineRef.current = false;
      setFailedKey('wallet.topup.callbackRetry');
      setPhase('verifying');
    }

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
      // PR-Agent r1: missing context = charge state UNKNOWABLE (a param-stripped
      // redirect can follow a successful charge) — the retry/auto-refund copy is
      // the truthful choice, never "no money was taken".
      setFailedKey('wallet.topup.callbackRetry');
      setCanRetry(false);
      trackEvent('topup_callback_result', { ok: false, reason: 'missing-context' });
      return;
    }
    setCanRetry(true);
    setInFlight(true);
    // Fresh attempt: the offline latch only protects the PREVIOUS attempt's
    // resolution — clear it so a new failure renders its own truthful state.
    offlineRef.current = false;

    verifyTopup.mutate(
      { paymentId, intentId },
      {
        onSuccess: (res) => {
          setInFlight(false);
          // Money-truth outranks UI: a LATE success (verified after the user
          // went offline and the UI resolved to the offline state) must still
          // win — the charge is real and credited.
          window.sessionStorage.removeItem(TOPUP_INTENT_SESSION_KEY);
          window.sessionStorage.removeItem(TOPUP_PAYMENT_SESSION_KEY);
          setCanRetry(false);
          setPhase(res.credited || res.alreadyCredited ? 'success' : 'failed');
          // PR-Agent r2: NO failure-copy override on the 200-not-credited
          // branch — a both-false anomaly (if ever reachable) keeps the
          // conditional-hedge default ('IF money left your account…'), which
          // is the only copy truthful when the charge state is unclear.
          trackEvent('topup_callback_result', {
            ok: res.credited || res.alreadyCredited,
            alreadyCredited: res.alreadyCredited,
            amountSar: res.amountSar,
          });
        },
        onError: (err: unknown) => {
          setInFlight(false);
          // P2-379 (PR-Agent r1): the offline-resolved surface stays offline —
          // the doomed fetch's late rejection must not overwrite the offline
          // state with the generic failure copy.
          if (offlineRef.current) return;
          captureError(err, { area: 'wallet-topup-callback' });
          // P2-276/P2-379: classify on the stable body `code` first (the API
          // 409s now carry { message, code }) with the legacy message-prefix
          // match as deploy-skew fallback — money-truthful localized copy
          // (charged vs not-charged vs unknown).
          const messageKey = topupCallbackMessageKey(err);
          setFailedKey(messageKey);
          setPhase('failed');
          // PR-Agent r2: carry the mapped bucket into analytics so prod can
          // split charged-declined vs not-charged vs unknown failures.
          trackEvent('topup_callback_result', {
            ok: false,
            reason: 'verify-error',
            failureKey: messageKey,
          });
        },
      },
    );
  }, [searchParams, verifyTopup, isOnline, verifyNonce]);

  /** P2-379: re-run the verify in place (ids persist in sessionStorage). */
  const retryVerify = () => {
    // PR-Agent r1: never fire while a verify may still be in flight (the
    // offline-at-mount auto-refire window) — duplicates re-verify a charge.
    if (!isOnline || phase !== 'failed' || inFlight) return;
    verifyTopup.reset();
    startedRef.current = false;
    offlineRef.current = false;
    setFailedKey('wallet.topup.callbackRetry');
    setPhase('verifying');
    setVerifyNonce((n) => n + 1);
  };

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
              aria-label={t('wallet.topup.backToWalletAria')}
              className="mt-6 w-full rounded-full bg-brand-black py-3.5 text-base font-semibold text-white"
            >
              {t('wallet.topup.backToWallet')}
            </button>
          </div>
        )}
        {phase === 'failed' && (
          <div role="status">
            {failedKey === 'wallet.topup.callbackOffline' ? (
              <WifiOff className="w-12 h-12 text-gray-400 mx-auto" aria-hidden />
            ) : (
              <XCircle className="w-12 h-12 text-red-500 mx-auto" aria-hidden />
            )}
            <p className="mt-4 text-base font-bold text-brand-black">{t('wallet.topup.callbackFailed')}</p>
            <p className="mt-1 text-sm text-gray-500">{t(failedKey)}</p>
            {canRetry && (
              <button
                type="button"
                onClick={retryVerify}
                className="mt-6 w-full rounded-full bg-brand-black py-3.5 text-base font-semibold text-white"
              >
                {t('wallet.topup.recoveryRetry')}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.replace('/wallet')}
              aria-label={t('wallet.topup.backToWalletAria')}
              className="mt-3 w-full rounded-full border border-brand-black py-3.5 text-base font-semibold text-brand-black"
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
