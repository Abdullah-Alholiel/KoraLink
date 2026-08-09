'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
    ArrowLeft,
    Plus,
    ArrowUpRight,
    CreditCard,
    Trophy,
    Wallet,
    CornerDownLeft,
    ShoppingBag,
    FileText,
    AlertTriangle,
    X,
} from 'lucide-react';
import { useWalletBalance, useWalletHistory, useTopupWallet } from '@/hooks/useWallet';
import type { Transaction } from '@/types';

function getTransactionIcon(icon: string) {
    switch (icon) {
        case 'match':
            return <Trophy className="w-5 h-5 text-brand-green" strokeWidth={1.5} />;
        case 'wallet':
            return <Wallet className="w-5 h-5 text-blue-500" strokeWidth={1.5} />;
        case 'refund':
            return <CornerDownLeft className="w-5 h-5 text-brand-green" strokeWidth={1.5} />;
        case 'store':
            return <ShoppingBag className="w-5 h-5 text-brand-red" strokeWidth={1.5} />;
        default:
            return <Wallet className="w-5 h-5 text-gray-400" strokeWidth={1.5} />;
    }
}

function groupTransactionsByDay(transactions: Transaction[], t: (key: string) => string) {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const groups: { label: string; items: Transaction[] }[] = [];
    const todayItems = transactions.filter(
        (t) => new Date(t.createdAt).toDateString() === today
    );
    const yesterdayItems = transactions.filter(
        (t) => new Date(t.createdAt).toDateString() === yesterday
    );
    const olderItems = transactions.filter((t) => {
        const d = new Date(t.createdAt).toDateString();
        return d !== today && d !== yesterday;
    });

    if (todayItems.length) groups.push({ label: t('wallet.today'), items: todayItems });
    if (yesterdayItems.length) groups.push({ label: t('wallet.yesterday'), items: yesterdayItems });
    if (olderItems.length) groups.push({ label: t('wallet.earlier'), items: olderItems });

    return groups;
}

export default function WalletPage() {
    const router = useRouter();
    const t = useTranslations();

    // ── Top-up modal state ──
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [topUpError, setTopUpError] = useState('');

    // ── Data fetching via React Query ──
    const {
        data: balanceData,
        isLoading: balanceLoading,
        error: balanceError,
    } = useWalletBalance();

    const {
        data: historyData,
        isLoading: historyLoading,
        error: historyError,
        refetch,
    } = useWalletHistory();

    const topup = useTopupWallet();

    const handleTopUpSubmit = () => {
        setTopUpError('');
        const amount = Number(topUpAmount);
        if (!topUpAmount || isNaN(amount) || amount <= 0) {
            setTopUpError(t('wallet.invalidAmount'));
            return;
        }
        if (amount < 10) {
            setTopUpError(t('wallet.minTopUp'));
            return;
        }
        topup.mutate(
            {
                amount,
                idempotencyKey: `topup-${Date.now()}`,
            },
            {
                onSuccess: () => {
                    setShowTopUpModal(false);
                    setTopUpAmount('');
                },
                onError: () => {
                    setTopUpError(t('common.error'));
                },
            }
        );
    };

    // Use API data only; fall back to sensible defaults when loading/error
    const balance = balanceData?.balance ?? 0;
    const transactions: Transaction[] = historyData?.transactions ?? [];
    const groups = groupTransactionsByDay(transactions, t);

    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex-shrink-0 bg-white px-4 pt-3 pb-2">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="w-10 h-10 flex items-center justify-center"
                        aria-label={t('common.back')}
                    >
                        <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                    </button>
                    <h1 className="text-lg font-bold text-brand-black flex-1 text-center pe-10">
                        {t('wallet.title')}
                    </h1>
                </div>
            </div>

            {/* ── Balance Card with loading/error states ── */}
            <div className="bg-white mx-4 mt-4 rounded-2xl p-6 text-center">
                {balanceLoading ? (
                    <>
                        <div className="h-3 w-24 bg-gray-200 rounded-full mx-auto animate-pulse" />
                        <div className="h-10 w-32 bg-gray-200 rounded-full mx-auto mt-3 animate-pulse" />
                    </>
                ) : balanceError ? (
                    <p className="text-sm text-gray-400">{t('common.error')}</p>
                ) : (
                    <>
                        <p className="text-xs text-brand-green font-semibold uppercase tracking-widest">
                            {t('wallet.availableBalance')}
                        </p>
                        <div className="flex items-baseline justify-center gap-2 mt-2">
                            <span className="text-4xl font-extrabold text-brand-black" dir="ltr">
                                {balance.toFixed(2)}
                            </span>
                            <span className="text-2xl font-bold text-gray-400">{t('wallet.currency')}</span>
                        </div>
                    </>
                )}
            </div>

            {/* ── Action Buttons ───────────────────── */}
            <div className="flex justify-center gap-8 mt-6 px-4">
                {[
                    { icon: Plus, label: t('wallet.topUp'), active: true, onClick: () => setShowTopUpModal(true) },
                    { icon: ArrowUpRight, label: t('wallet.withdraw'), active: false, onClick: () => {} },
                    { icon: CreditCard, label: t('wallet.cards'), active: false, onClick: () => {} },
                ].map((action) => (
                    <button
                        key={action.label}
                        onClick={action.onClick}
                        disabled={!action.active}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
                    >
                        <div
                            className={`w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform ${
                                action.active
                                    ? 'bg-brand-green text-white shadow-[0_4px_20px_rgba(37,65,50,0.4)]'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                        >
                            <action.icon className="w-6 h-6" strokeWidth={1.5} />
                        </div>
                        <span className="text-xs text-gray-600 font-medium">{action.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Divider ──────────────────────────── */}
            <div className="h-2 bg-brand-bg mt-6" />

            {/* ── Recent Activity with 5 UX states ── */}
            <div className="px-4 pt-4 pb-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-brand-black">
                        {t('wallet.transactions')}
                    </h2>
                    <button className="text-sm font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1">
                        {t('common.seeAll')}
                    </button>
                </div>

                {/* Loading state */}
                {historyLoading && (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                                </div>
                                <div className="h-5 bg-gray-100 rounded w-16" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Error state */}
                {historyError && !historyLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-3">
                            <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm text-gray-400 text-center mb-4">
                            {t('common.errorDescription')}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                )}

                {/* Empty state (API returned no transactions) */}
                {!historyLoading && !historyError && historyData && transactions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <Wallet className="w-7 h-7 text-gray-300" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-base font-bold text-brand-black mb-1">
                            {t('wallet.noTransactions')}
                        </h3>
                        <p className="text-sm text-gray-400 text-center">
                            {t('wallet.noTransactionsDescription')}
                        </p>
                    </div>
                )}

                {/* Populated state — grouped transactions */}
                {!historyLoading && !historyError && transactions.length > 0 && groups.length > 0 && (
                    <>
                        {groups.map((group) => (
                            <div key={group.label} className="mb-4">
                                <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3">
                                    {group.label}
                                </p>
                                <div className="space-y-4">
                                    {group.items.map((txn) => (
                                        <div key={txn.id} className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                                                {getTransactionIcon(txn.icon)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-brand-black truncate">
                                                    {txn.title}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {txn.description}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span
                                                    className={`text-sm font-bold ${
                                                        txn.type === 'credit'
                                                            ? 'text-brand-green'
                                                            : 'text-brand-red'
                                                    }`}
                                                    dir="ltr"
                                                >
                                                    {txn.amount.toFixed(2)} ﷼{' '}
                                                    {txn.type === 'credit' ? '+' : '-'}
                                                </span>
                                                <FileText className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Offline fallback indicator */}
                        {historyError && historyData === undefined && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mt-4">
                                <p className="text-xs text-amber-700 font-medium">
                                    {t('common.offlineBanner')}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
            {/* ══════════════════════════════════════
                TOP-UP MODAL
            ═══════════════════════════════════ */}
            {showTopUpModal && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-50" onClick={() => { setShowTopUpModal(false); setTopUpAmount(''); setTopUpError(''); }} />
                    <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-50 animate-slide-up">
                        <div className="flex justify-center pt-3 pb-2">
                            <div className="w-10 h-1 rounded-full bg-gray-300" />
                        </div>
                        <div className="px-5 pb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-brand-black">{t('wallet.topUp')}</h2>
                                <button
                                    onClick={() => { setShowTopUpModal(false); setTopUpAmount(''); setTopUpError(''); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                                >
                                    <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                                </button>
                            </div>

                            <p className="text-xs text-gray-400 mb-3">{t('wallet.topUpAmount')}</p>
                            <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 mb-3 focus-within:border-brand-green transition-colors">
                                <span className="text-sm font-bold text-gray-500" dir="ltr">SAR</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={topUpAmount}
                                    onChange={(e) => setTopUpAmount(e.target.value)}
                                    placeholder="0"
                                    className="flex-1 text-lg font-bold text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                                    autoFocus
                                />
                            </div>

                            <p className="text-xs text-gray-400 mb-4">{t('wallet.minTopUp')}</p>

                            {topUpError && (
                                <p className="text-sm text-brand-red mb-3 text-center">{topUpError}</p>
                            )}

                            <button
                                onClick={handleTopUpSubmit}
                                disabled={topup.isPending || !topUpAmount}
                                className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                                    shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                                    active:scale-[0.98] transition-transform
                                    disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                            >
                                {topup.isPending ? t('payment.processing') : t('wallet.topUp')}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
