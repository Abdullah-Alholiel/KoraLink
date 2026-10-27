'use client';

/**
 * P0-2 (run #169) — Moyasar hosted payment form inside a bottom sheet.
 *
 * Card data NEVER touches KoraLink: the form library (moyasar-payment-form,
 * loaded from the CDN at submit time) tokenizes directly browser→api.moyasar.com.
 * Server legs: POST /wallet/topup/intent pins the amount BEFORE the form
 * initializes; POST /wallet/topup/verify credits after `on_completed` hands us
 * the payment id (server re-fetches the payment — client events are hints).
 *
 * 3DS: frictionless cards complete in-place via on_completed; challenge flows
 * full-page-redirect to /<locale>/wallet/topup/callback, which re-verifies.
 *
 * The library is injected as a script tag on first use (not bundled): its npm
 * type declarations reference an undeclared global namespace, and the CDN
 * hosts are CSP-allowlisted in next.config.mjs (script-src) alongside
 * api.moyasar.com (connect-src) for the tokenization XHRs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { AlertTriangle, CreditCard, ShieldCheck } from 'lucide-react';

import BottomSheet from '@/components/layout/BottomSheet';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { uuid } from '@/lib/uuid';
import { classifyError, errorKey } from '@/lib/error-classify';
import { trackEvent, captureError } from '@/providers/ObservabilityProvider';
import {
  useCreateTopupIntent,
  useVerifyTopup,
  type TopupIntentResponse,
} from '@/hooks/useTopup';
import { TOPUP_INTENT_SESSION_KEY, TOPUP_PAYMENT_SESSION_KEY } from '@/lib/topup';

/** Minimal shape of the CDN-loaded form library (docs.moyasar.com contract). */
interface MoyasarFormApi {
  init(config: {
    element: string;
    amount: number;
    currency: string;
    description: string;
    publishable_api_key: string;
    callback_url: string;
    supported_networks: string[];
    methods: string[];
    on_completed: (payment: { id: string; status: string; amount: number; source?: { message?: string | null } | null }) => void | Promise<void>;
  }): void;
}

declare global {
  interface Window {
    Moyasar?: MoyasarFormApi;
  }
}

const FORM_CDN = 'https://cdn.jsdelivr.net/npm/moyasar-payment-form@2.3.0/dist/moyasar.umd.min.js';
const QUICK_AMOUNTS = [5, 10, 20, 50] as const;

function loadMoyasarScript(): Promise<MoyasarFormApi> {
  return new Promise((resolve, reject) => {
    if (window.Moyasar) return resolve(window.Moyasar);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FORM_CDN}"]`);
    const onLoad = () => {
      if (window.Moyasar) resolve(window.Moyasar);
      else reject(new Error('Moyasar form loaded but global is missing'));
    };
    if (existing) {
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', () => reject(new Error('Failed to load the payment form')));
      return;
    }
    const script = document.createElement('script');
    script.src = FORM_CDN;
    script.async = true;
    script.addEventListener('load', onLoad);
    script.addEventListener('error', () => reject(new Error('Failed to load the payment form')));
    document.body.appendChild(script);
  });
}

interface TopupSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCredited?: () => void;
  minAmount: number;
  maxAmount: number;
}

export default function TopupSheet({
  isOpen,
  onClose,
  onCredited,
  minAmount,
  maxAmount,
}: TopupSheetProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/')[1] || 'en';
  const isOnline = useOnlineStatus();
  const createIntent = useCreateTopupIntent();
  const verifyTopup = useVerifyTopup();

  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'form' | 'form-loading' | 'paying'>('form');
  /** PR-Agent r1 IMPORTANT: a failed verify keeps the charged payment's ids visible with a retry. */
  const [pendingPayment, setPendingPayment] = useState<{ paymentId: string; intentId: string } | null>(null);
  const intentRef = useRef<TopupIntentResponse | null>(null);
  const formHostRef = useRef<HTMLDivElement | null>(null);

  const reset = useCallback(() => {
    setAmount('');
    setError(null);
    setStage('form');
    setPendingPayment(null);
    intentRef.current = null;
    if (formHostRef.current) formHostRef.current.innerHTML = '';
  }, []);

  const retryVerify = useCallback(() => {
    if (!pendingPayment) return;
    setError(null);
    verifyTopup.mutate(
      { paymentId: pendingPayment.paymentId, intentId: pendingPayment.intentId },
      {
        onSuccess: (res) => {
          trackEvent('topup_completed', {
            amountSar: res.amountSar,
            alreadyCredited: res.alreadyCredited,
            via: 'recovery',
            locale,
          });
          window.sessionStorage.removeItem(TOPUP_PAYMENT_SESSION_KEY);
          window.sessionStorage.removeItem(TOPUP_INTENT_SESSION_KEY);
          setPendingPayment(null);
          onCredited?.();
          onClose();
        },
        onError: (err: unknown) => {
          captureError(err, { area: 'wallet-topup-verify-retry' });
          setError(t(errorKey(classifyError(err))));
        },
      },
    );
  }, [locale, onClose, onCredited, pendingPayment, t, verifyTopup]);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOnline && stage !== 'form') setError(t('wallet.topup.offlineNote'));
  }, [isOnline, stage, t]);

  const startPayment = useCallback(async () => {
    setError(null);
    if (!isOnline) {
      setError(t('wallet.topup.offlineNote'));
      return;
    }
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed < minAmount || parsed > maxAmount) {
      setError(t('wallet.topup.invalidAmount', { min: minAmount, max: maxAmount }));
      return;
    }
    setStage('form-loading');
    try {
      const intentRes = await createIntent.mutateAsync({
        amountSar: parsed,
        idempotencyKey: uuid(),
      });
      intentRef.current = intentRes;
      // The 3DS redirect boots a fresh page — the intent id must survive the
      // round-trip (same tab), or the callback can never prove ownership.
      window.sessionStorage.setItem(TOPUP_INTENT_SESSION_KEY, intentRes.intent.id);
      trackEvent('topup_intent_created', { amountSar: parsed, locale });

      const Moyasar = await loadMoyasarScript();
      if (!formHostRef.current) throw new Error('form host missing');
      formHostRef.current.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'mysr-form';
      formHostRef.current.appendChild(host);

      Moyasar.init({
        element: host as unknown as string,
        amount: intentRes.intent.amount_halalas,
        currency: 'SAR',
        description: `wallet-topup:${intentRes.intent.id}`,
        publishable_api_key: intentRes.publishableKey,
        callback_url: `${window.location.origin}/${locale}/wallet/topup/callback`,
        supported_networks: ['visa', 'mastercard', 'mada', 'unionpay'],
        methods: ['creditcard'],
        on_completed: (payment) => {
          if (!intentRef.current) return;
          setStage('paying');
          // PR-Agent r1 IMPORTANT: a charged payment must never become
          // unrecoverable. Persist paymentId+intentId BEFORE verifying — if
          // the verify fails, the recovery block offers an explicit retry
          // carrying the SAME ids (and a page reload can't lose them).
          window.sessionStorage.setItem(TOPUP_INTENT_SESSION_KEY, intentRef.current.intent.id);
          window.sessionStorage.setItem(TOPUP_PAYMENT_SESSION_KEY, payment.id);
          verifyTopup.mutate(
            { paymentId: payment.id, intentId: intentRef.current.intent.id },
            {
              onSuccess: (res) => {
                trackEvent('topup_completed', {
                  amountSar: res.amountSar,
                  alreadyCredited: res.alreadyCredited,
                  locale,
                });
                window.sessionStorage.removeItem(TOPUP_PAYMENT_SESSION_KEY);
                window.sessionStorage.removeItem(TOPUP_INTENT_SESSION_KEY);
                onCredited?.();
                onClose();
              },
              onError: (err: unknown) => {
                captureError(err, { area: 'wallet-topup-verify' });
                setPendingPayment({ paymentId: payment.id, intentId: intentRef.current?.intent.id ?? '' });
                setError(t(errorKey(classifyError(err))));
                setStage('paying');
              },
            },
          );
        },
      });
      setStage('paying');
    } catch (err) {
      captureError(err, { area: 'wallet-topup-intent' });
      setError(t(errorKey(classifyError(err))));
      setStage('form');
    }
  }, [amount, createIntent, isOnline, locale, maxAmount, minAmount, onClose, onCredited, t, verifyTopup]);

  if (!isOpen) return null;

  const showFormStage = stage !== 'form';

  return (
    <BottomSheet open={isOpen} onClose={onClose} maxHeightClass="max-h-[85dvh]">
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      <div className="flex items-center px-5 pb-3 relative flex-shrink-0">
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
        >
          <span aria-hidden className="text-xl text-brand-black leading-none">×</span>
        </button>
        <h2 className="text-lg font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
          {t('wallet.topup.title')}
        </h2>
      </div>

      {!showFormStage && (
        <div className="px-5 pb-2 flex-shrink-0">
          <p className="text-sm text-gray-500 mb-3">{t('wallet.topup.subtitle')}</p>

          {pendingPayment && (
            <div role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-800">{t('wallet.topup.recoveryTitle')}</p>
              <p className="mt-1 text-xs leading-snug text-amber-700">{t('wallet.topup.recoveryBody')}</p>
              <button
                type="button"
                onClick={retryVerify}
                disabled={verifyTopup.isPending}
                className="mt-2 w-full rounded-full bg-brand-black py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t('wallet.topup.recoveryRetry')}
              </button>
            </div>
          )}

          {!isOnline && (
            <div role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden />
              <p className="text-xs text-amber-700">{t('wallet.topup.offlineNote')}</p>
            </div>
          )}

          <label className="block text-xs font-medium text-gray-500 mb-1.5" htmlFor="topup-amount">
            {t('wallet.topup.amountLabel')}
          </label>
          <input
            id="topup-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''));
              setError(null);
            }}
            placeholder="50.00"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-black/10"
          />

          <div className="flex gap-2 mt-2.5" role="group" aria-label={t('wallet.topup.quickAmounts')}>
            {QUICK_AMOUNTS.map((qa) => (
              <button
                key={qa}
                type="button"
                aria-pressed={amount === String(qa)}
                onClick={() => {
                  setAmount(String(qa));
                  setError(null);
                }}
                className="flex-1 rounded-full border border-gray-200 py-2 text-sm font-medium text-brand-black hover:bg-gray-50 aria-pressed:bg-brand-black aria-pressed:text-white"
              >
                {qa}
              </button>
            ))}
          </div>

          {error && (
            <div role="status" className="mt-3 rounded-xl bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void startPayment()}
            disabled={!isOnline || stage !== 'form' || createIntent.isPending}
            className="mt-4 w-full rounded-full bg-brand-black py-3.5 text-base font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <CreditCard className="w-4 h-4" aria-hidden />
              {t('wallet.topup.payWithCard')}
            </span>
          </button>

          <p className="mt-3 mb-4 flex items-start justify-center gap-1.5 text-[11px] leading-snug text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden />
            {t('wallet.topup.secureNote')}
          </p>
        </div>
      )}

      {showFormStage && (
        <div className="px-5 pb-6 flex-1 overflow-y-auto">
          {stage === 'form-loading' && (
            <div role="status" className="py-10 text-center text-sm text-gray-500">
              {t('wallet.topup.processing')}
            </div>
          )}
          {error && (
            <div role="status" className="mb-3 rounded-xl bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
          {/* Always mounted once the flow starts: the library resolves from the
              cache on the microtask queue (2nd top-up in a session), which is
              BEFORE React flushes a mount keyed on intentRef — mounting on the
              stage state (a real re-render) removes the null-host race. */}
          <div ref={formHostRef} data-testid="moyasar-form-host" className={stage === 'form-loading' ? 'hidden' : undefined} />
        </div>
      )}
    </BottomSheet>
  );
}
