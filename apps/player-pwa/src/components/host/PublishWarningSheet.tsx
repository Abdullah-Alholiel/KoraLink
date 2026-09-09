'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Shield, CircleAlert, Wallet } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import { computeShortfall } from '@/lib/publish-error';

export interface PublishWarningSheetProps {
    open: boolean;
    mode: 'koralink' | 'self';
    /** i18n key of the classified publish error, or null while publishing/clean. */
    errorKey?: string | null;
    /** Security deposit amount (pitch cost, koralink mode). Null = nothing to show. */
    depositSar?: number | null;
    /** Host's current wallet balance; null while loading/unknown. */
    walletBalanceSar?: number | null;
    /** True once the balance query has resolved (drives the loading line). */
    balanceResolved?: boolean;
    /** Server-confirmed deficit (parsed from the API's 400 message). When set,
     *  the shortfall block shows even if the local balance looked sufficient. */
    serverShortfallSar?: number | null;
    /** Hosting-terms consent (cycle player-host-responsibility): publish is
     *  BLOCKED until the host accepts — server also enforces (400 otherwise). */
    consentAccepted: boolean;
    onConsentChange: (accepted: boolean) => void;
    onTopUp: () => void;
    onConfirm: () => void;
    onCancel: () => void;
    isPending: boolean;
}

export default function PublishWarningSheet({
    open, mode, errorKey, depositSar, walletBalanceSar, balanceResolved, serverShortfallSar, consentAccepted, onConsentChange, onTopUp, onConfirm, onCancel, isPending,
}: PublishWarningSheetProps) {
    const t = useTranslations();

    if (!open) return null;

    const isSelf = mode === 'self';
    const hasError = !!errorKey;

    // Shortfall, two paths (koralink mode ONLY — self-booked never has a
    // wallet deposit wall, even if props leak in):
    //  - proactive: deposit + resolved balance both known and balance < deposit
    //  - server-confirmed: the API rejected the debit (race — balance changed
    //    mid-flow) and its message carried parseable Required/Available amounts.
    // Balance unknown after resolution (fetch failure) must NOT block
    // publishing — the server remains authoritative.
    const proactiveShort = !isSelf
        && depositSar != null
        && balanceResolved === true
        && walletBalanceSar != null
        && walletBalanceSar < depositSar;
    const isShort = !isSelf && (proactiveShort || serverShortfallSar != null);
    const shortfallSar = isShort
        ? (serverShortfallSar ?? computeShortfall(depositSar as number, walletBalanceSar as number))
        : 0;

    return (
        <BottomSheet open={open} onClose={onCancel} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                {/* Icon + Title */}
                <div className="flex flex-col items-center mb-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                        isSelf ? 'bg-amber-100' : 'bg-brand-green/10'
                    }`}>
                        {isSelf ? (
                            <AlertTriangle className="w-7 h-7 text-amber-600" strokeWidth={2} />
                        ) : (
                            <Shield className="w-7 h-7 text-brand-green" strokeWidth={2} />
                        )}
                    </div>
                    <h2 className="text-lg font-bold text-brand-black">
                        {t('host.warningTitle')}
                    </h2>
                </div>

                {/* Body text */}
                <div className={`rounded-xl p-4 mb-4 text-sm leading-relaxed ${
                    isSelf
                        ? 'bg-amber-50 border border-amber-200 text-gray-700'
                        : 'bg-brand-green/5 border border-brand-green/20 text-gray-700'
                }`}>
                    {isSelf ? t('host.warningSelfBody') : t('host.warningViaUsBody')}
                </div>

                {/* Hosting-terms consent (cycle player-host-responsibility) —
                    mandatory in BOTH modes: self = stronger warning (host runs
                    ALL pitch ops); koralink = shared responsibility. Publish
                    stays disabled until accepted; the server rejects the
                    booking anyway when the flag is absent. */}
                <div className="rounded-xl p-4 mb-4 bg-white border border-gray-200">
                    <p className="text-sm font-bold text-brand-black mb-1.5">
                        {t('host.hostingConsentTitle')}
                    </p>
                    <p className={`text-xs leading-relaxed ${isSelf ? 'text-amber-800' : 'text-gray-600'}`}>
                        {isSelf ? t('host.hostingConsentBodySelf') : t('host.hostingConsentBodyKoralink')}
                    </p>
                    <button
                        type="button"
                        data-testid="hosting-consent"
                        onClick={() => onConsentChange(!consentAccepted)}
                        className="mt-3 flex items-start gap-3 text-start w-full"
                        aria-pressed={consentAccepted}
                    >
                        <span
                            className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                                consentAccepted ? 'bg-brand-green border-brand-green' : 'border-gray-300 bg-white'
                            }`}
                        >
                            {consentAccepted && (
                                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <path d="M2 6l3 3 5-5" />
                                </svg>
                            )}
                        </span>
                        <span className="text-xs font-semibold text-brand-black">
                            {t('host.hostingConsentLabel')}
                        </span>
                    </button>
                </div>

                {/* Security deposit card (koralink mode only) — tells the host
                    exactly how much wallet balance this booking consumes, BEFORE
                    the publish attempt. */}
                {!isSelf && depositSar != null && (
                    <div
                        data-testid="deposit-card"
                        className={`rounded-xl p-4 mb-4 text-sm ${isShort
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-gray-50 border border-gray-200'}`}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400">{t('host.depositLabel')}</span>
                            <span dir="ltr" className="text-base font-extrabold text-brand-black">
                                SAR {depositSar.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">{t('host.yourBalance')}</span>
                            {balanceResolved === false ? (
                                <span className="text-xs text-gray-400">{t('host.checkingBalance')}</span>
                            ) : walletBalanceSar == null ? (
                                <span className="text-xs text-gray-400">—</span>
                            ) : (
                                <span dir="ltr" className={`text-sm font-bold ${isShort ? 'text-brand-red' : 'text-brand-black'}`}>
                                    SAR {walletBalanceSar.toFixed(2)}
                                </span>
                            )}
                        </div>
                        {/* Refund-back note — true today: host cancel and
                            underfill auto-cancel credit back the full deposit. */}
                        <p className="text-xs text-gray-400 leading-relaxed">
                            {t('host.depositNote')}
                        </p>
                    </div>
                )}

                {/* Shortfall call to action — shown proactively (balance below
                    deposit) or after a server-confirmed 400 whose message carries
                    parseable amounts. Confirm is disabled; the way out is top-up. */}
                {isShort && (
                    <div
                        role="alert"
                        data-testid="wallet-shortfall"
                        className="rounded-xl p-4 mb-4 bg-brand-red/5 border border-brand-red/20 flex items-start gap-3"
                    >
                        <Wallet className="w-5 h-5 text-brand-red flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div className="flex-1 text-sm leading-relaxed">
                            <p className="font-bold text-brand-red mb-0.5">{t('host.shortfallLabel')}</p>
                            <p className="text-gray-700">
                                {t('host.shortfallBody', { amount: shortfallSar.toFixed(2) })}
                            </p>
                            <button
                                type="button"
                                onClick={onTopUp}
                                data-testid="top-up-button"
                                className="mt-3 w-full py-3 rounded-2xl bg-brand-green text-white text-sm font-bold
                                    flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                                    active:scale-[0.98] transition-transform"
                            >
                                <Wallet className="w-4 h-4" strokeWidth={2.5} />
                                {t('host.topUpWallet')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Contextual publish error — localized, shown at the moment
                    of failure. Confirm re-enables so the user can retry. */}
                {hasError && (
                    <div
                        role="alert"
                        data-testid="publish-error"
                        className="rounded-xl p-4 mb-5 bg-brand-red/5 border border-brand-red/20 flex items-start gap-3"
                    >
                        <CircleAlert className="w-5 h-5 text-brand-red flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div className="text-sm text-gray-700 leading-relaxed">
                            <p className="font-bold text-brand-red mb-0.5">{t('host.errorTitle')}</p>
                            <p>{t(errorKey!)}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Buttons */}
            <div className="px-5 pb-6 flex gap-3 flex-shrink-0">
                <button
                    onClick={onCancel}
                    className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600
                        hover:bg-gray-50 active:scale-[0.98] transition-all"
                >
                    {t('host.warningCancel')}
                </button>
                <button
                    onClick={onConfirm}
                    disabled={isPending || isShort || !consentAccepted}
                    data-testid="confirm-publish"
                    className={`flex-1 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all
                        disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed ${
                        isSelf
                            ? 'bg-amber-600 shadow-[0_4px_20px_rgba(217,119,6,0.3)]'
                            : 'bg-brand-green shadow-[0_4px_20px_rgba(37,65,50,0.4)]'
                    }`}
                >
                    {isPending
                        ? t('host.publishing')
                        : isSelf
                            ? t('host.warningConfirmSelf')
                            : t('host.warningConfirmViaUs')
                    }
                </button>
            </div>
        </BottomSheet>
    );
}
