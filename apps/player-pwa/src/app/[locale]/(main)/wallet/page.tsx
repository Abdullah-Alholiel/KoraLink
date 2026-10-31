'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { classifyError, errorKey } from '@/lib/error-classify';
import { formatMoney, formatCount } from '@/lib/format';
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
    Download,
} from 'lucide-react';
import {
    useWalletBalance,
    useWalletHistory,
    useTopupWallet,
    useFetchAllWalletHistory,
} from '@/hooks/useWallet';
import { useAppStore } from '@/store/useAppStore';
import { uuid } from '@/lib/uuid';
import { useNow } from '@/hooks/useNow';
import BottomSheet from '@/components/layout/BottomSheet';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import OfflineBanner from '@/components/layout/OfflineBanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { buildWalletCsv, toIsoDateRange, walletCsvFilename } from '@/lib/wallet-csv';
import { downloadTextAsFile } from '@/lib/download';
// P2-289 (run #180): shared top-up amount domain — presets + config-driven
// validation (the legacy sheet previously hardcoded a SAR-10 minimum while
// the API/config minimum is 5).
import { TOPUP_QUICK_AMOUNTS, validateTopupAmount } from '@/lib/topup-amount';
import type { Transaction } from '@/types';
import { useTopupConfig, useLatestTopupIntent } from '@/hooks/useTopup';
import TopupSheet from '@/components/wallet/TopupSheet';

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

function groupTransactionsByDay(
    transactions: Transaction[],
    t: (key: string) => string,
    nowMs: number,
) {
    // Hydration-safe clock (run #50, P2-59): `now` is passed in from the
    // component's useNow() — null during SSR and the first client render, so
    // both sides bucket identically ("Earlier"). Previously a render-path
    // new Date()/Date.now() (Reviewer A, run #50; same class as the run-#40
    // MatchCard and run-#49 messages fixes).
    const today = new Date(nowMs).toDateString();
    const yesterday = new Date(nowMs - 86400000).toDateString();

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
    const intlLocale = useLocale() as 'ar' | 'en';
    const showToast = useAppStore((s) => s.showToast);

    // ── Top-up modal state ──
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [topUpError, setTopUpError] = useState('');

    // ── Export sheet state (P2-119) ──
    const [showExportSheet, setShowExportSheet] = useState(false);
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const [exportError, setExportError] = useState('');
    const [exporting, setExporting] = useState(false);

    // ── Data fetching via React Query ──
    const {
        data: balanceData,
        isLoading: balanceLoading,
        error: balanceError,
        refetch: retryBalance,
    } = useWalletBalance();

    const {
        data: historyData,
        isLoading: historyLoading,
        error: historyError,
        refetch,
    } = useWalletHistory();

    const topup = useTopupWallet();
    const fetchAllHistory = useFetchAllWalletHistory();
    // P0-2 (run #169): when the Moyasar top-up is enabled server-side, the
    // entry modal routes through the hosted-form flow (TopupSheet); the
    // legacy dummy self-credit modal stays as the flag-off fallback so dev
    // environments keep their seeding path.
    const { data: topupConfig } = useTopupConfig();
    const moyasarEnabled = topupConfig?.enabled === true;
    // P2-279 (run #176): newest top-up attempt — the player-visible trace of
    // an attempt that never landed (failed 3DS / abandoned verify). The card
    // renders ONLY for a pending attempt; credited attempts already show as
    // ledger transactions below.
    const { data: latestTopup } = useLatestTopupIntent({
        enabled: moyasarEnabled,
    });
    const pendingTopup =
        latestTopup?.intent?.status === 'pending' ? latestTopup.intent : null;
    const [showTopupSheet, setShowTopupSheet] = useState(false);

    const closeExportSheet = () => {
        setShowExportSheet(false);
        setExportError('');
    };

    const handleExport = async () => {
        setExportError('');
        const range = toIsoDateRange(exportFrom, exportTo);
        if (range.inverted) {
            setExportError(t('wallet.exportInvalidRange'));
            return;
        }
        setExporting(true);
        try {
            const { rows, truncated } = await fetchAllHistory({
                from: range.from,
                to: range.to,
            });
            // PR-Agent IMPORTANT (run #84): never hand the user a silently
            // partial financial CSV — cancel and tell them to narrow the
            // range instead.
            if (truncated) {
                showToast(t('wallet.exportTooMany'), 'info');
                return;
            }
            if (rows.length === 0) {
                showToast(t('wallet.exportEmpty'), 'info');
                return;
            }
            // BOM so spreadsheet apps read the file as UTF-8.
            downloadTextAsFile(
                '\uFEFF' + buildWalletCsv(rows),
                walletCsvFilename(new Date()),
                'text/csv;charset=utf-8',
            );
            showToast(t('wallet.exportSuccess'), 'success');
            closeExportSheet();
        } catch {
            // error-message standard: what happened + what to do next.
            showToast(`${t('errors.exportFailed')} ${t('errors.exportFailedDetail')}`, 'error');
        } finally {
            setExporting(false);
        }
    };

    const handleTopUpSubmit = () => {
        setTopUpError('');
        // P2-289 (run #180): bounds come from the SERVER config (GET
        // /wallet/topup/config), not hardcoded client values — fixes the
        // SAR-10-vs-5 contract drift and adds the missing max check.
        const minSar = topupConfig?.minAmount ?? 5;
        const maxSar = topupConfig?.maxAmount ?? 2000;
        const verdict = validateTopupAmount(topUpAmount, minSar, maxSar);
        if (verdict === 'empty' || verdict === 'invalid') {
            setTopUpError(t('wallet.invalidAmount'));
            return;
        }
        if (verdict === 'belowMin' || verdict === 'aboveMax') {
            setTopUpError(
                t('wallet.topup.invalidAmount', { min: minSar, max: maxSar }),
            );
            return;
        }
        topup.mutate(
            {
                amount: Number(topUpAmount),
                idempotencyKey: `topup-${uuid()}`,
            },
            {
                onSuccess: () => {
                    setShowTopUpModal(false);
                    setTopUpAmount('');
                },
                onError: (err: unknown) => {
                    // FetchError carries the HTTP status — 403 means the dummy
                    // top-up is production-gated (P0-2); show the specific message.
                    if (
                        err instanceof Error &&
                        'status' in err &&
                        (err as { status: number }).status === 403
                    ) {
                        setTopUpError(t('wallet.topupDisabled'));
                    } else {
                        // error-message standard: what happened + money-moved
                        // reassurance + next step. Never raw backend text.
                        setTopUpError(t('errors.walletTopupFailed'));
                    }
                },
            }
        );
    };

    // Use API data only; show skeleton while loading
    const balance = balanceData?.balance ?? 0;
    const transactions: Transaction[] = historyData?.transactions ?? [];
    // P2-129 (run #92): real network state — a fetch ERROR is not proof of
    // being offline (run #92 play-feed fix, same class). The wallet is a
    // money surface: offline must never read as live.
    const isOnline = useOnlineStatus();
    // Hydration-safe wall clock (P2-59, run #50): null during SSR and the
    // first client render; 0 buckets all transactions as "Earlier" on that
    // one render, then the real clock buckets by the device's day boundary.
    const now = useNow();
    const groups = groupTransactionsByDay(transactions, t, now ?? 0);

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
                        <ArrowLeft className="w-5 h-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
                    </button>
                    <h1 className="text-lg font-bold text-brand-black flex-1 text-center">
                        {t('wallet.title')}
                    </h1>
                </div>
            </div>

            {/* P2-129 (run #92): real-network offline banner — money surface
                must never read as live (mirrors clubs/profile pattern). */}
            <OfflineBanner isOffline={!isOnline} className="mx-4 mt-2" />

            {/* ── Balance Card with loading/error states ── */}
            <div className="bg-white mx-4 mt-4 rounded-2xl p-6 text-center">
                {balanceLoading ? (
                    <>
                        <div className="h-3 w-24 bg-gray-200 rounded-full mx-auto animate-pulse" />
                        <div className="h-10 w-32 bg-gray-200 rounded-full mx-auto mt-3 animate-pulse" />
                    </>
                ) : balanceError ? (
                    <ErrorState
                        title={t(errorKey(classifyError(balanceError)))}
                        onRetry={() => void retryBalance()}
                        retryLabel={t('common.retry')}
                    />
                ) : (
                    <>
                        <p className="text-xs text-brand-green font-semibold uppercase tracking-widest">
                            {t('wallet.availableBalance')}
                        </p>
                        <div className="flex items-baseline justify-center gap-2 mt-2">
                            <span className="text-4xl font-extrabold text-brand-black">
                                {formatMoney(balance, intlLocale)}
                            </span>
                        </div>
                        {!isOnline && balanceData !== undefined && (
                            <p className="text-[11px] text-gray-400 mt-2" role="status">
                                {t('wallet.offlineBalanceNote')}
                            </p>
                        )}
                    </>
                )}
            </div>

            {/* ── P2-279: last top-up attempt (pending only) ── */}
            {pendingTopup && (
                <div
                    className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
                    role="status"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-amber-900">
                                {t('wallet.topup.lastAttemptPendingTitle')}
                            </p>
                            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                {t('wallet.topup.lastAttemptPendingBody', {
                                    amount: formatMoney(
                                        pendingTopup.amountSar,
                                        intlLocale
                                    ),
                                })}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowTopupSheet(true)}
                            className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform"
                        >
                            {t('wallet.topup.lastAttemptRetry')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Action Buttons ───────────────────── */}
            <div className="flex justify-center gap-6 mt-6 px-4">
                {[
                    { icon: Plus, label: t('wallet.topUp'), active: true, onClick: () => (moyasarEnabled ? setShowTopupSheet(true) : setShowTopUpModal(true)) },
                    { icon: ArrowUpRight, label: t('wallet.withdraw'), active: false, onClick: () => showToast(t('wallet.comingSoon'), 'info') },
                    { icon: CreditCard, label: t('wallet.cards'), active: false, onClick: () => showToast(t('wallet.comingSoon'), 'info') },
                    { icon: Download, label: t('wallet.export'), active: false, onClick: () => setShowExportSheet(true) },
                ].map((action) => (
                    <button
                        key={action.label}
                        onClick={action.onClick}
                        aria-label={action.label}
                        className="flex flex-col items-center gap-2"
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
                        <span className={`text-xs font-medium ${action.active ? 'text-gray-600' : 'text-gray-400'}`}>{action.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Divider ──────────────────────────── */}
            <div className="h-2 bg-brand-bg mt-6" />

            {/* ── Recent Activity with 5 UX states ── */}
            <div className="px-4 pt-[var(--top-safe-inset)] pb-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-brand-black">
                        {t('wallet.transactions')}
                    </h2>
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
                            {t(errorKey(classifyError(historyError)))}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                )}

                {/* Empty state (API returned no transactions) — shared component (P2-247 adoption, run #172) */}
                {!historyLoading && !historyError && historyData && transactions.length === 0 && (
                    <EmptyState
                        icon={Wallet}
                        title={t('wallet.noTransactions')}
                        description={t('wallet.noTransactionsDescription')}
                    />
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
                                                >
                                                    {formatMoney(
                                                        txn.type === 'credit'
                                                            ? txn.amount
                                                            : -txn.amount,
                                                        intlLocale,
                                                    )}
                                                </span>
                                                <FileText className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                    </>
                )}
            </div>
            {/* ══════════════════════════════════════
                TOP-UP MODAL (flag-off fallback — dummy self-credit)
            ═══════════════════════════════════ */}
            <BottomSheet open={showTopUpModal} onClose={() => { setShowTopUpModal(false); setTopUpAmount(''); setTopUpError(''); }} widthClass="max-w-xl">
                <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-brand-black">{t('wallet.topUp')}</h2>
                        <button
                            onClick={() => { setShowTopUpModal(false); setTopUpAmount(''); setTopUpError(''); }}
                            aria-label={t('wallet.closeModal')}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                        >
                            <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                        </button>
                    </div>

                    <p className="text-xs text-gray-400 mb-3">{t('wallet.topUpAmount')}</p>

                    {/* P2-289 (run #180): preset chips — same 4 presets as the
                        Moyasar TopupSheet (shared TOPUP_QUICK_AMOUNTS). Chip
                        digits route through formatCount (Arabic-Indic for AR;
                        Reviewer B run-#180 design-lens). */}
                    <div className="mb-3 flex gap-2" role="group" aria-label={t('wallet.topup.quickAmounts')}>
                        {TOPUP_QUICK_AMOUNTS.map((qa) => (
                            <button
                                key={qa}
                                type="button"
                                aria-pressed={topUpAmount === String(qa)}
                                onClick={() => {
                                    setTopUpAmount(String(qa));
                                    setTopUpError('');
                                }}
                                className="flex-1 rounded-full border border-gray-200 py-2 text-sm font-medium text-brand-black hover:bg-gray-50 aria-pressed:bg-brand-black aria-pressed:text-white"
                            >
                                {formatCount(qa, intlLocale)}
                            </button>
                        ))}
                    </div>

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

                    <p className="text-xs text-gray-400 mb-4">
                        {/* P2-289 (run #180): dedicated hint key (PR-Agent r1 MINOR)
                            — the error key showed the identical sentence twice. */}
                        {t('wallet.topup.amountHint', {
                            min: topupConfig?.minAmount ?? 5,
                            max: topupConfig?.maxAmount ?? 2000,
                        })}
                    </p>

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
            </BottomSheet>

            {/* ══════════════════════════════════════
                TOP-UP SHEET (P0-2 Moyasar hosted form — flag-on path)
            ═══════════════════════════════════ */}
            <TopupSheet
                isOpen={showTopupSheet}
                onClose={() => setShowTopupSheet(false)}
                onCredited={() => showToast(t('wallet.topup.successBody'), 'success')}
                minAmount={topupConfig?.minAmount ?? 5}
                maxAmount={topupConfig?.maxAmount ?? 2000}
            />

            {/* ══════════════════════════════════════
                EXPORT SHEET (P2-119)
            ═══════════════════════════════════ */}
            <BottomSheet open={showExportSheet} onClose={closeExportSheet} widthClass="max-w-xl">
                <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-brand-black">{t('wallet.exportTitle')}</h2>
                        <button
                            onClick={closeExportSheet}
                            aria-label={t('wallet.closeModal')}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                        >
                            <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-gray-400">{t('wallet.exportFrom')}</span>
                            <input
                                type="date"
                                value={exportFrom}
                                max={exportTo || undefined}
                                onChange={(e) => { setExportFrom(e.target.value); setExportError(''); }}
                                className="bg-gray-50 rounded-xl border border-gray-100 px-3 py-3 text-sm text-brand-black outline-none focus:border-brand-green transition-colors"
                                dir="ltr"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-gray-400">{t('wallet.exportTo')}</span>
                            <input
                                type="date"
                                value={exportTo}
                                min={exportFrom || undefined}
                                onChange={(e) => { setExportTo(e.target.value); setExportError(''); }}
                                className="bg-gray-50 rounded-xl border border-gray-100 px-3 py-3 text-sm text-brand-black outline-none focus:border-brand-green transition-colors"
                                dir="ltr"
                            />
                        </label>
                    </div>

                    {exportError && (
                        <p role="alert" className="text-sm text-brand-red mb-3 text-center">{exportError}</p>
                    )}

                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                            shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                            active:scale-[0.98] transition-transform
                            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        {exporting ? t('payment.processing') : t('wallet.exportCsv')}
                    </button>
                </div>
            </BottomSheet>
        </div>
    );
}
