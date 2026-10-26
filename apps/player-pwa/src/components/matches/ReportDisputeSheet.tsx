'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    CalendarX2,
    CheckCircle2,
    Clock,
    Loader2,
    MessageSquareWarning,
    ReceiptText,
    TriangleAlert,
    UserX,
    X,
} from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import { classifyError, errorKey } from '@/lib/error-classify';
import type { FetchError } from '@/lib/fetcher';
import type { DisputeType } from '@/hooks/useDisputes';

interface ReportDisputeSheetProps {
    isOpen: boolean;
    onClose: () => void;
    matchTitle: string;
    /** The user's currently-open dispute (drives the under-review state), if any. */
    openDispute: { type: string; status: string } | null;
    isPending: boolean;
    error?: FetchError | Error | null;
    onSubmit: (type: DisputeType, reason: string) => void;
}

const CATEGORIES: Array<{
    type: DisputeType;
    icon: typeof UserX;
    iconCls: string;
}> = [
    { type: 'no_show', icon: UserX, iconCls: 'text-red-500 bg-red-50' },
    { type: 'double_booking', icon: CalendarX2, iconCls: 'text-amber-500 bg-amber-50' },
    { type: 'pitch_condition', icon: TriangleAlert, iconCls: 'text-orange-500 bg-orange-50' },
    { type: 'unrecognized_charge', icon: ReceiptText, iconCls: 'text-purple-500 bg-purple-50' },
    { type: 'other', icon: MessageSquareWarning, iconCls: 'text-gray-500 bg-gray-100' },
];

const STATUS_STYLES: Record<string, { icon: typeof Clock; iconCls: string; key: string }> = {
    opened: { icon: Clock, iconCls: 'text-amber-500 bg-amber-50', key: 'statusOpened' },
    under_review: { icon: Clock, iconCls: 'text-blue-500 bg-blue-50', key: 'statusUnderReview' },
    resolved: { icon: CheckCircle2, iconCls: 'text-brand-green bg-brand-green/10', key: 'statusResolved' },
    rejected: { icon: X, iconCls: 'text-gray-500 bg-gray-100', key: 'statusRejected' },
};

/**
 * Player dispute origination sheet (P1-69) — any roster member can file a
 * dispute on this match in one of the five shared categories. Mirrors
 * AppealSheet's structure (same endpoint; the sheet adds category choice).
 * A currently-open dispute renders as an under-review card instead of the form.
 */
export default function ReportDisputeSheet({
    isOpen,
    onClose,
    matchTitle,
    openDispute,
    isPending,
    error,
    onSubmit,
}: ReportDisputeSheetProps) {
    const t = useTranslations('dispute');
    // a11y (run #80, P2-101): localized close label.
    const tCommon = useTranslations('common');
    const [type, setType] = useState<DisputeType | null>(null);
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    const openStatus = openDispute
        ? STATUS_STYLES[openDispute.status] ?? STATUS_STYLES.opened
        : null;

    const submit = () => {
        if (!type) return;
        onSubmit(type, reason.trim());
    };

    return (
        <BottomSheet open={isOpen} onClose={onClose} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
                <div className="w-8" />
                <h2 className="text-lg font-bold text-brand-black">{t('title')}</h2>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100" aria-label={tCommon('close')}>
                    <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-brand-green/10 flex items-center justify-center mb-3">
                        <MessageSquareWarning className="w-7 h-7 text-brand-green" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-semibold text-brand-black text-center">{matchTitle}</p>
                    <p className="text-xs text-gray-500 text-center mt-1 leading-relaxed">{t('subtitle')}</p>
                </div>

                {openStatus ? (
                    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 flex items-start gap-3" role="status">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${openStatus.iconCls}`}>
                            <openStatus.icon className="w-4 h-4" strokeWidth={2} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-brand-black">{t(openStatus.key)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {t('statusCategory')} · {t(`cat_${openDispute?.type ?? 'other'}`)}
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mt-5 space-y-2" role="radiogroup" aria-label={t('categoryLabel')}>
                            {CATEGORIES.map((cat) => {
                                const Icon = cat.icon;
                                const selected = type === cat.type;
                                return (
                                    <button
                                        key={cat.type}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => setType(cat.type)}
                                        className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-start transition-all ${
                                            selected
                                                ? 'border-brand-green bg-brand-green/5'
                                                : 'border-gray-100 bg-white shadow-card'
                                        }`}
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cat.iconCls}`}>
                                            <Icon className="w-4 h-4" strokeWidth={2} />
                                        </div>
                                        <span className="text-sm font-semibold text-brand-black flex-1">
                                            {t(`cat_${cat.type}`)}
                                        </span>
                                        {selected && (
                                            <CheckCircle2 className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {type === 'no_show' && (
                            <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-xl px-3 py-2">{t('catNoShowHint')}</p>
                        )}

                        <div className="mt-4">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                                {t('reasonLabel')}
                            </label>
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 focus-within:border-brand-green transition-colors px-4 py-3">
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    maxLength={1000}
                                    placeholder={t('reasonPlaceholder')}
                                    className="w-full text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent resize-none"
                                />
                            </div>
                            <div className="flex justify-end mt-1">
                                <span className="text-[10px] text-gray-300" dir="ltr">{reason.length}/1000</span>
                            </div>
                        </div>

                        {error && (() => {
                            const kind = classifyError(error);
                            // Dispute-refined copy for the two classes this
                            // flow actually produces (400 not-marked /
                            // 403 non-roster); other kinds use the shared
                            // errors.* copy verbatim (error-message standard).
                            const key =
                                kind === 'validation'
                                    ? 'dispute.errorValidation'
                                    : kind === 'forbidden'
                                      ? 'dispute.errorForbidden'
                                      : errorKey(kind);
                            return (
                                <p className="text-xs text-brand-red mt-2 bg-brand-red/5 rounded-xl px-3 py-2" role="alert">
                                    {t(key)}
                                </p>
                            );
                        })()}
                    </>
                )}
            </div>

            {!openStatus && (
                <div className="px-5 pb-8 pt-1 flex-shrink-0">
                    <button
                        onClick={submit}
                        disabled={isPending || !type}
                        className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform shadow-[0_4px_20px_rgba(37,65,50,0.3)]"
                    >
                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        {t('submit')}
                    </button>
                </div>
            )}
        </BottomSheet>
    );
}
