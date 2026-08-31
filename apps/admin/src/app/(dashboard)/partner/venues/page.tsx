'use client';

import { useState } from 'react';
import { Loader2, MapPin, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerVenueRow } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import VenueFormDrawer from '@/components/VenueFormDrawer';

export default function PartnerVenuesPage() {
  const t = useTranslations('partner.venues');
  const tc = useTranslations('common');
  const { data, loading, error, reload } = useLiveAdminData<PartnerVenueRow[]>('/partner/venues', ['venues']);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PartnerVenueRow | null>(null);

  return (
    <div>
      <PageHeader
        title={t('titleMine')}
        subtitle={t('subtitleMine')}
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('addVenue')}
          </button>
        }
      />

      <div className="space-y-6 p-8">
        {/* Create drawer */}
        <VenueFormDrawer open={creating} venue={null} onClose={() => setCreating(false)} onSaved={reload} />

        {/* Edit drawer */}
        <VenueFormDrawer open={!!editing} venue={editing} onClose={() => setEditing(null)} onSaved={reload} />

        {loading ? (
          <div className="py-10 text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="py-10 text-sm text-brand-red">{t('error', { error })}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((v) => (
              <div key={v.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <MapPin className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{v.name}</div>
                      <div className="text-xs text-gray-500">{v.city} · {v.address}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={v.is_approved ? 'approved' : 'pending'} />
                    {v.is_koralink_partner && (
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{t('partnerBadge')}</span>
                    )}
                  </div>
                </div>

                {Array.isArray(v.amenities) && (v.amenities as string[]).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(v.amenities as string[]).map((a) => (
                      <span key={a} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{a}</span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="text-xs text-gray-500">
                    {t('pitchCount', { count: v.pitch_count ?? 0 })}
                    {v.open_hour !== undefined && v.close_hour !== undefined && (
                      <> · {t('hoursSummary', { open: v.open_hour, close: v.close_hour })}</>
                    )}
                  </span>
                  <button
                    onClick={() => setEditing(editing?.id === v.id ? null : v)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                  >
                    <Pencil className="h-3.5 w-3.5" /> {tc('edit')}
                  </button>
                </div>
              </div>
            ))}
            {!data?.length && <div className="text-sm text-gray-400">{t('empty')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
