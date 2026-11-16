'use client';

/**
 * P2-293 (run #185) — HostPayoutReceipt: the money-truth card for the
 * completing player-host. Renders INSIDE match detail (inline card, not a
 * sheet — no z-index concerns) when the payout has been released; shows the
 * exact math releaseHostPayoutInTx used: fee pool, payer count, platform
 * fee, forfeits (already received at leave time), and the total credited.
 * All money renders through formatMoney (locale digits: en "SAR 57.00" /
 * ar Arabic-Indic), all copy through the wallet.* i18n namespace (EN+AR).
 * 5-UX states: loading skeleton / error hidden (money-truth: never guess) /
 * empty+non-host render nothing / success = the card.
 */
import { useTranslations, useLocale } from 'next-intl';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { usePayoutReceipt } from '@/hooks/usePayoutReceipt';

interface Props {
  matchId: string;
  isUserHost: boolean;
  isPlayerHosted: boolean;
  matchStatus: string;
}

export default function HostPayoutReceipt({
  matchId,
  isUserHost,
  isPlayerHosted,
  matchStatus,
}: Props) {
  const t = useTranslations('wallet');
  const locale = useLocale() as 'ar' | 'en';
  const enabled =
    isUserHost && isPlayerHosted && matchStatus === 'completed';
  const { data, isLoading } = usePayoutReceipt(matchId, enabled);

  if (!enabled || isLoading) {
    if (!enabled) return null;
    return (
      <div className="mx-5 mt-4 rounded-2xl bg-gray-50 border border-gray-200 p-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-xs text-gray-500">{t('payoutReceiptLoading')}</span>
      </div>
    );
  }

  // 404 (not host / not released) or a fetch error → the card stays hidden.
  // Money surfaces never render a guessed breakdown.
  if (!data) return null;

  return (
    <div className="mx-5 mt-4 rounded-2xl bg-gray-50 border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
        <p className="text-sm font-bold text-brand-black">
          {t('payoutReceiptTitle')}
        </p>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">
            {t('payoutReceiptFeePool', { count: data.breakdown.payers })}
          </dt>
          <dd className="font-semibold text-gray-900">
            {formatMoney(data.breakdown.feePoolSar, locale)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">
            {t('payoutReceiptPlatformFee', {
              count: data.breakdown.payers,
              amount: formatMoney(data.breakdown.perJoinerFeeSar, locale),
            })}
          </dt>
          <dd className="font-semibold text-gray-900">
            −{formatMoney(data.breakdown.platformFeeSar, locale)}
          </dd>
        </div>
        {data.forfeitSar > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">
              {t('payoutReceiptForfeits', { count: data.forfeits })}
            </dt>
            <dd className="font-semibold text-gray-900">
              +{formatMoney(data.forfeitSar, locale)}
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
          <dt className="font-bold text-brand-black">
            {t('payoutReceiptTotal')}
          </dt>
          <dd className="font-bold text-brand-green">
            {formatMoney(data.totalCreditedSar, locale)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
