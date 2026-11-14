'use client';

/**
 * F5 (run #206, D-20261106-13) — player transaction receipt sheet.
 *
 * Opened from a wallet history row tap. Renders the proof-of-payment:
 * receipt number, amount, status, when issued, and type-aware context
 * (match title/date/venue for MATCH_FEE + REFUND rows; payment reference
 * for TOPUP rows; a ledger note for everything else).
 *
 * 5 UX states: loading skeleton / classified error + retry / 404 →
 * "unavailable" copy (not an error — same doctrine as usePayoutReceipt) /
 * offline → classified error copy / success body. Share uses the Web Share
 * API when present (progressive enhancement — the button does not render
 * where `navigator.share` is missing, so there is no dead UI).
 *
 * Money + dates render through the format helpers (Arabic-Indic numerals in
 * ar) — never raw `${n} SAR` interpolation (P2-342/P2-353 defect class).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Copy, Share2 } from 'lucide-react';

import BottomSheet from '@/components/layout/BottomSheet';
import { classifyError, errorKey } from '@/lib/error-classify';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  formatMoney,
  formatShortDate,
  type AppLocale,
} from '@/lib/format';
import {
  useTransactionReceipt,
  type TransactionReceipt,
} from '@/hooks/useTransactionReceipt';

interface ReceiptSheetProps {
  txId: string | null;
  open: boolean;
  onClose: () => void;
  locale: AppLocale;
}

/** Receipt status chip tint per ledger status. */
const STATUS_TONE: Record<TransactionReceipt['status'], string> = {
  Completed: 'bg-brand-green/10 text-brand-green',
  Pending: 'bg-amber-500/10 text-amber-600',
  Failed: 'bg-brand-red/10 text-brand-red',
  Reversed: 'bg-gray-100 text-gray-500',
};

export default function ReceiptSheet({
  txId,
  open,
  onClose,
  locale,
}: ReceiptSheetProps) {
  const t = useTranslations();
  const online = useOnlineStatus();
  const { data, isLoading, isError, error, refetch } =
    useTransactionReceipt(txId, open);

  const receipt = data ?? null;

  // PR-Agent r2 (PR #256): gate navigator.share on mount, not render — the
  // server never has it, so a render-time gate would render the button
  // client-only and produce a hydration mismatch on the sheet markup.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator.share !== 'undefined');
  }, []);

  async function handleShare(r: TransactionReceipt) {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: r.receiptNumber,
        text: `${r.receiptNumber} — ${formatMoney(r.amountSar, locale, r.currency)}`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  function handleCopy(r: TransactionReceipt) {
    void navigator.clipboard?.writeText(r.receiptNumber);
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex-shrink-0 px-5 pt-1 pb-2">
        <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto" />
        <h2 className="text-base font-bold text-brand-black text-center mt-2">
          {t('wallet.receiptTitle')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-8">
        {/* 1. Loading */}
        {isLoading && (
          <div className="space-y-3 animate-pulse" data-testid="receipt-loading" role="status">
            <div className="h-5 bg-gray-100 rounded w-1/2 mx-auto" />
            <div className="h-10 bg-gray-100 rounded w-2/3 mx-auto" />
            <div className="h-4 bg-gray-100 rounded w-1/3 mx-auto" />
            <div className="h-16 bg-gray-100 rounded mt-4" />
          </div>
        )}

        {/* 2. Error (classified; offline rides the same classified copy) */}
        {isError && (
          <div className="flex flex-col items-center py-8" role="status" data-testid="receipt-error">
            {!online && (
              <p className="text-xs text-gray-400 mb-1">{t('errors.offline')}</p>
            )}
            <p className="text-sm text-gray-500 text-center">
              {t(errorKey(classifyError(error)))}
            </p>
            <button
              onClick={() => void refetch()}
              className="mt-4 bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* 3. Not found — missing receipt is NOT an error for this surface */}
        {!isLoading && !isError && !receipt && (
          <p
            className="text-sm text-gray-400 text-center py-8"
            role="status"
            data-testid="receipt-unavailable"
          >
            {t('wallet.receiptUnavailable')}
          </p>
        )}

        {/* 4. Success body */}
        {receipt && (
          <div data-testid="receipt-body">
            <div className="text-center">
              <p
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${STATUS_TONE[receipt.status]}`}
              >
                {t(`wallet.receiptStatus${receipt.status}`)}
              </p>
              <p
                className={`text-3xl font-extrabold mt-3 ${receipt.direction === 'credit' ? 'text-brand-green' : 'text-brand-black'}`}
              >
                {receipt.direction === 'credit' ? '+' : '−'}
                {formatMoney(receipt.amountSar, locale, receipt.currency)}
              </p>
            </div>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">{t('wallet.receiptNumber')}</dt>
                <dd className="font-mono text-xs font-semibold text-brand-black text-right pt-1">
                  {receipt.receiptNumber}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">{t('wallet.receiptIssued')}</dt>
                <dd className="font-semibold text-brand-black text-right">
                  {formatShortDate(new Date(receipt.createdAt), locale)}
                </dd>
              </div>

              {receipt.context.kind === 'match' && (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">{t('wallet.receiptMatch')}</dt>
                    <dd className="font-semibold text-brand-black text-right">
                      {receipt.context.matchTitle}
                    </dd>
                  </div>
                  {receipt.context.scheduledAt && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-400">{t('wallet.receiptDate')}</dt>
                      <dd className="font-semibold text-brand-black text-right flex items-center gap-1 justify-end">
                        <CalendarDays className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
                        {formatShortDate(new Date(receipt.context.scheduledAt), locale)}
                      </dd>
                    </div>
                  )}
                  {receipt.context.venueName && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-400">{t('wallet.receiptVenue')}</dt>
                      <dd className="font-semibold text-brand-black text-right">
                        {receipt.context.venueName}
                        {receipt.context.city ? ` · ${receipt.context.city}` : ''}
                      </dd>
                    </div>
                  )}
                </>
              )}

              {receipt.context.kind === 'topup' && receipt.context.paymentId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-400">{t('wallet.receiptPaymentRef')}</dt>
                  <dd className="font-mono text-xs font-semibold text-brand-black text-right break-all max-w-[60%]">
                    {receipt.context.paymentId}
                  </dd>
                </div>
              )}

              {receipt.context.kind === 'generic' && (
                <p className="text-xs text-gray-400 text-center pt-2">
                  {t('wallet.receiptGenericNote')}
                </p>
              )}
            </dl>

            <div className="flex items-center justify-center gap-3 mt-7">
              <button
                type="button"
                onClick={() => handleCopy(receipt)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-gray-200 text-sm font-semibold text-brand-black active:scale-95 transition-transform"
              >
                <Copy className="w-4 h-4" strokeWidth={1.5} />
                {receipt.receiptNumber}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => void handleShare(receipt)}
                  aria-label={t('wallet.receiptShare')}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-brand-green text-white text-sm font-bold active:scale-95 transition-transform"
                >
                  <Share2 className="w-4 h-4" strokeWidth={1.5} />
                  {t('wallet.receiptShare')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
