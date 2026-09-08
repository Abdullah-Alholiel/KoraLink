'use client';

/**
 * ChangePhoneSheet — P1-19 (run #44): lost-SIM recovery.
 *
 * Two steps inside one bottom sheet (shared BottomSheet — portals to body,
 * z-[60] backdrop / z-[70] panel, dvh + pb-safe per the iOS sheet rules):
 *   1. request — E.164 input (local 9-digit entry, +966 prefix pinned,
 *      dir=ltr), fires POST /users/me/change-phone/request.
 *   2. verify  — 6-digit code entry, fires POST /users/me/change-phone/verify.
 *      Success reconciles React Query + Zustand (hook does it) and toasts.
 *
 * Error UX follows the run-#38 error-message standard: everything routes
 * through lib/error-classify → localized copy rendered INSIDE the sheet
 * (role="alert"), confirm stays enabled for in-place retry, and the
 * request-step error resets when the mutation is reused. There is no raw
 * err.message anywhere. PostHog events: phone_change_requested / _completed.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Loader2, Phone, ShieldCheck } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import {
  useRequestPhoneChange,
  useVerifyPhoneChange,
  type UserProfileApi,
} from '@/hooks/useUser';
import { classifyError, ERROR_KEYS } from '@/lib/error-classify';
import { trackEvent } from '@/providers/ObservabilityProvider';

export type ChangePhoneStep = 'request' | 'verify';

interface ChangePhoneSheetProps {
  open: boolean;
  onClose: () => void;
  /** The OLD number, shown read-only for orientation. */
  currentPhone: string;
  onVerified: (updated: UserProfileApi) => void;
}

/** Local 9-digit Saudi mobile: digits only, starts with 5. */
function isValidLocal(p: string): boolean {
  return /^5\d{8}$/.test(p);
}

/** Local 9-digit → E.164 for the API (mirrors useAuth's +966 prefixing). */
function toE164(local: string): string {
  return `+966${local}`;
}

export default function ChangePhoneSheet({
  open,
  onClose,
  currentPhone,
  onVerified,
}: ChangePhoneSheetProps) {
  const t = useTranslations();
  const [step, setStep] = useState<ChangePhoneStep>('request');
  const [localPhone, setLocalPhone] = useState('');
  const [code, setCode] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');

  const request = useRequestPhoneChange();
  const verify = useVerifyPhoneChange();

  const resetAll = () => {
    setStep('request');
    setLocalPhone('');
    setCode('');
    setPendingPhone('');
    request.reset();
    verify.reset();
  };

  const close = () => {
    onClose();
    // Clear state AFTER the sheet unmounts its content (kept simple: reset
    // immediately — the close animation doesn't render these fields).
    resetAll();
  };

  const sameAsCurrent = localPhone.length === 9 && toE164(localPhone) === currentPhone;

  const submitRequest = () => {
    if (!isValidLocal(localPhone)) return;
    // Local duplicate check first: don't burn an SMS on a number the user
    // already has, and show the specific copy instead of a generic conflict.
    if (sameAsCurrent) return;
    request.reset();
    request.mutate(
      { phone: toE164(localPhone) },
      {
        onSuccess: (res) => {
          setPendingPhone(toE164(localPhone));
          setStep('verify');
          trackEvent('phone_change_requested', { cooldownSeconds: res.cooldownSeconds });
        },
        // No onError toast — the classified error renders inside the sheet.
      },
    );
  };

  const submitVerify = () => {
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return;
    verify.reset();
    verify.mutate(
      { phone: pendingPhone, code },
      {
        onSuccess: (updated) => {
          trackEvent('phone_change_completed');
          onVerified(updated);
          close();
        },
      },
    );
  };

  // ── Localized error keys (what happened / why / what next) ──
  const requestErrorKey = request.isError
    ? requestSpecificKey(classifyError(request.error))
    : null;
  const verifyErrorKey = verify.isError
    ? verifySpecificKey(classifyError(verify.error))
    : null;

  const canSubmitRequest = isValidLocal(localPhone) && !sameAsCurrent && !request.isPending;

  return (
    <BottomSheet open={open} onClose={close} widthClass="max-w-md">
      <div className="px-5 pt-6 pb-2" data-testid="change-phone-sheet">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-black">{t('profile.changePhone')}</h2>
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        {step === 'request' && (
          <div className="pb-6">
            <p className="mb-4 text-sm text-gray-600">{t('profile.changePhoneSubtitle')}</p>

            {/* Current number (read-only, masked context) */}
            <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                {t('profile.phoneNumber')}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-brand-black" dir="ltr">
                {currentPhone}
              </p>
            </div>

            {/* New number input — native numeric keyboard via inputMode */}
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
              {t('profile.changePhoneNewNumber')}
            </label>
            <div className="mb-3 flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50 px-4 py-2.5 transition-colors focus-within:border-brand-green">
              <Phone className="h-4 w-4 flex-shrink-0 text-gray-400" strokeWidth={2} />
              <span className="text-sm font-medium text-gray-500" dir="ltr">
                +966
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={9}
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder={t('profile.changePhoneNewNumberPlaceholder')}
                aria-label={t('profile.changePhoneNewNumber')}
                className="w-full bg-transparent text-sm font-semibold text-brand-black outline-none placeholder:font-normal placeholder:text-gray-300"
                dir="ltr"
              />
            </div>
            {localPhone.length > 0 && !isValidLocal(localPhone) && (
              <p className="mb-3 text-xs text-brand-red">
                {t('profile.changePhoneInvalidNumber')}
              </p>
            )}
            {sameAsCurrent && (
              <p className="mb-3 text-xs text-brand-red">{t('profile.changePhoneSameNumber')}</p>
            )}

            {/* Classified error — inside the sheet, role=alert, retry enabled */}
            {requestErrorKey && (
              <div
                role="alert"
                data-testid="change-phone-error"
                className="mb-3 rounded-xl border border-brand-red/20 bg-brand-red/5 px-4 py-3"
              >
                <p className="text-sm font-bold text-brand-red">
                  {t('profile.changePhoneErrorTitle')}
                </p>
                <p className="mt-0.5 text-xs text-gray-600">{t(requestErrorKey)}</p>
              </div>
            )}

            <button
              onClick={submitRequest}
              disabled={!canSubmitRequest}
              className="mt-2 w-full rounded-2xl bg-brand-green py-4 text-sm font-bold text-white shadow-[0_4px_20px_rgba(37,65,50,0.4)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
            >
              {request.isPending ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" strokeWidth={2} />
              ) : (
                t('profile.changePhoneSendCode')
              )}
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="pb-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                <ShieldCheck className="h-5 w-5 text-brand-green" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-bold text-brand-black">
                  {t('profile.changePhoneVerifyTitle')}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t('profile.changePhoneVerifySubtitle')}{' '}
                  <span dir="ltr" className="font-semibold text-brand-black">
                    {pendingPhone}
                  </span>
                </p>
              </div>
            </div>

            {/* 6-digit code input */}
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
              {t('profile.changePhoneCodeLabel')}
            </label>
            <div className="mb-3 flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50 px-4 py-2.5 transition-colors focus-within:border-brand-green">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-label={t('profile.changePhoneCodeLabel')}
                className="w-full bg-transparent text-center text-lg font-bold tracking-[0.4em] text-brand-black outline-none"
                dir="ltr"
              />
            </div>

            {/* Classified error — same in-sheet standard */}
            {verifyErrorKey && (
              <div
                role="alert"
                data-testid="change-phone-error"
                className="mb-3 rounded-xl border border-brand-red/20 bg-brand-red/5 px-4 py-3"
              >
                <p className="text-sm font-bold text-brand-red">
                  {t('profile.changePhoneErrorTitle')}
                </p>
                <p className="mt-0.5 text-xs text-gray-600">{t(verifyErrorKey)}</p>
              </div>
            )}

            <button
              onClick={submitVerify}
              disabled={code.length !== 6 || verify.isPending}
              className="w-full rounded-2xl bg-brand-green py-4 text-sm font-bold text-white shadow-[0_4px_20px_rgba(37,65,50,0.4)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
            >
              {verify.isPending ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" strokeWidth={2} />
              ) : (
                t('profile.changePhoneVerify')
              )}
            </button>

            <button
              onClick={() => {
                setStep('request');
                setCode('');
                verify.reset();
              }}
              className="mt-3 w-full py-2 text-center text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600"
            >
              {t('profile.changePhoneCancel')}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Request-step message mapping: the sheet owns ONE reassurance headline
 * ("nothing was changed") + a specific classified body. Conflict (409) gets
 * the dedicated taken-copy; rate limits and validation reuse errors.*;
 */
function requestSpecificKey(kind: string): string {
  if (kind === 'conflict') return 'profile.changePhoneNumberTaken';
  return ERROR_KEYS[kind as keyof typeof ERROR_KEYS] ?? 'errors.unknown';
}

/** Verify-step mapping: OTP failures get the otpFailed body (matches the verify page idiom). */
function verifySpecificKey(kind: string): string {
  if (kind === 'unauthorized') return 'errors.otpFailed';
  if (kind === 'conflict') return 'profile.changePhoneNumberTaken';
  return ERROR_KEYS[kind as keyof typeof ERROR_KEYS] ?? 'errors.unknown';
}
