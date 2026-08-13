'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Calendar, MapPin, Info, X, Plus } from 'lucide-react';
import { usePayWallet } from '@/hooks/useWallet';
import { uuid } from '@/lib/uuid';

interface PaymentSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onPaySuccess: () => void;
    matchTitle: string;
    matchTime: string;
    matchLocation: string;
    matchId: string;
    price: number;
    walletBalance: number;
}

export default function PaymentSheet({
    isOpen,
    onClose,
    onPaySuccess,
    matchTitle,
    matchTime,
    matchLocation,
    matchId,
    price,
    walletBalance,
}: PaymentSheetProps) {
    const t = useTranslations();
    const router = useRouter();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const [agreed, setAgreed] = useState(false);
    // Stable idempotency key per logical payment attempt — prevents double-charge on retry.
    // Only regenerates when the user explicitly re-opens the sheet.
    const [idempotencyKey] = useState(() => `match-join-${matchId}-${uuid()}`);
    const payWallet = usePayWallet();
    const toPay = Math.max(0, price - walletBalance);
    const canAfford = walletBalance >= price;

    // Reset checkbox state when sheet closes
    useEffect(() => {
        if (!isOpen) setAgreed(false);
    }, [isOpen]);

    const handlePay = async () => {
        if (!agreed) return;

        // Pay from wallet
        payWallet.mutate(
            {
                amount: price,
                idempotencyKey,
                referenceId: matchId,
            },
            {
                onSuccess: () => onPaySuccess(),
            }
        );
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
                onClick={onClose}
            />

            {/* Bottom Sheet */}
            <div className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl max-w-md mx-auto animate-slide-up h-[75vh] overflow-y-auto">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                {/* Header */}
                <div className="flex items-center px-5 pb-4 relative">
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50">
                        <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                    </button>
                    <h2 className="text-lg font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                        {t('payment.title')}
                    </h2>
                    <button onClick={onClose} className="ms-auto w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50">
                        <X className="w-5 h-5 text-gray-400" strokeWidth={2} />
                    </button>
                </div>

                {/* Match Card */}
                <div className="mx-5 rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 relative">
                        <Image src="/images/stadium-bg.png" alt="Match" fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-brand-black">{matchTitle}</h3>
                        <div className="flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                            <span className="text-xs text-gray-500">{matchTime}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                            <span className="text-xs text-gray-500 truncate">{matchLocation}</span>
                        </div>
                    </div>
                </div>

                {/* Price Breakdown */}
                <div className="mx-5 mt-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{t('payment.total')}</span>
                        <span className="text-sm font-bold text-brand-black">SAR {price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{t('profile.wallet')}</span>
                        <span className="text-sm font-bold text-brand-black">SAR {walletBalance.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-gray-100" />
                    <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-brand-black">{t('payment.total')}</span>
                        <span className="text-xl font-extrabold text-brand-red">SAR {toPay.toFixed(2)}</span>
                    </div>
                </div>

                {/* Insufficient Balance Warning + Top-Up CTA */}
                {!canAfford && (
                    <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-amber-800">{t('payment.insufficientBalance')}</p>
                        <p className="text-xs text-amber-600 mt-1">{t('payment.topUpToJoin')}</p>
                        <button
                            onClick={() => {
                                onClose();
                                router.push(`/${locale}/wallet`);
                            }}
                            className="mt-3 w-full flex items-center justify-center gap-2 bg-brand-green text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-transform"
                        >
                            <Plus className="w-4 h-4" strokeWidth={2} />
                            {t('wallet.topUp')}
                        </button>
                    </div>
                )}

                {/* Refund Policy */}
                <div className="mx-5 mt-5 bg-gray-50 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div>
                            <p className="text-sm font-bold text-brand-black">{t('payment.matchTitle')}</p>
                            <p className="text-xs text-gray-500 mt-1">{t('host.disclaimerText')}</p>
                        </div>
                    </div>
                </div>

                {/* Agree Checkbox */}
                <div className="mx-5 mt-5 flex items-start gap-3">
                    <button
                        onClick={() => setAgreed(!agreed)}
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                            agreed ? 'bg-brand-green border-brand-green' : 'border-gray-300 bg-white'
                        }`}
                    >
                        {agreed && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path d="M2 6l3 3 5-5" />
                            </svg>
                        )}
                    </button>
                    <p className="text-xs text-gray-500">{t('host.disclaimer')} {t('host.disclaimerText').slice(0, 80)}...</p>
                </div>

                {/* CTA */}
                <div className="mx-5 mt-5 pb-8">
                    <button
                        onClick={handlePay}
                        disabled={!agreed || payWallet.isPending || !canAfford}
                        className={`w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all ${
                            agreed && !payWallet.isPending && canAfford
                                ? 'bg-brand-green shadow-[0_4px_16px_rgba(27,67,50,0.3)] active:scale-[0.98]'
                                : 'bg-gray-300 cursor-not-allowed'
                        }`}
                    >
                        {payWallet.isPending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {t('payment.processing')}
                            </>
                        ) : !canAfford ? (
                            t('payment.insufficientBalance')
                        ) : (
                            <>{t('payment.payWithWallet')} SAR {price.toFixed(2)}</>
                        )}
                    </button>
                    {payWallet.isError && (
                        <p className="text-xs text-brand-red mt-2 text-center">
                            {t('payment.paymentFailed')}
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}
