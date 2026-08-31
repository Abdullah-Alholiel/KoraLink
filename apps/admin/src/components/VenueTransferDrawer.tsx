'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Drawer from '@/components/Drawer';
import FormField from '@/components/FormField';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface OwnerCandidate {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
}

interface VenueTransferDrawerProps {
  venue: { id: string; name: string; owner_name?: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Ownership transfer drawer (admin-ux-overhaul slice 4): search venue
 * owners, pick the new owner, confirm the immediate hand-over. The venue's
 * pitches move with it (ownership flows through venues.owner_id).
 */
export default function VenueTransferDrawer({ venue, onClose, onSaved }: VenueTransferDrawerProps) {
  const t = useTranslations('venueTransfer');
  const tc = useTranslations('common');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OwnerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<OwnerCandidate | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced owner search.
  useEffect(() => {
    if (!venue) return;
    const v = venue; // narrow for the nested setTimeout closure
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ role: 'VenueOwner', perPage: '10' });
        if (query.trim()) qs.set('search', query.trim());
        const res = await api.get<{ users: OwnerCandidate[] }>(`/admin/users?${qs.toString()}`);
        // Never offer the current owner as a target.
        setResults((res.users ?? []).filter((u) => u.id !== v.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : tc('failedToLoad'));
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id, query]);

  if (!venue) return null;

  // Narrowed alias for closures.
  const v = venue;

  async function transfer() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/venues/${v.id}/transfer-ownership`, { newOwnerId: selected.id });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <Drawer
      open={!!venue}
      onClose={onClose}
      title={t('title', { name: v.name })}
      subtitle={t('subtitle')}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {tc('cancel')}
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={!selected || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            {t('confirmLabel')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {v.owner_name && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {t('currentOwner')}: <span className="font-medium text-gray-900">{v.owner_name}</span>
          </p>
        )}

        <FormField label={t('searchPhLabel')}>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-brand-500">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder={t('searchPh')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </FormField>

        {searching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {tc('loading')}
          </div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t('noResults')}</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(selected?.id === u.id ? null : u)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start transition-colors',
                  selected?.id === u.id
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                <span>
                  <span className="block text-sm font-medium text-gray-900">{u.full_name ?? '—'}</span>
                  <span className="block text-xs text-gray-500" dir="ltr">{u.phone ?? ''}</span>
                </span>
                {selected?.id === u.id && <UserCheck className="h-4 w-4 text-brand-600" />}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-brand-red">{error}</p>}
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('confirmTitle')}
        message={selected ? t('confirmMsg', { name: selected.full_name ?? '—' }) : undefined}
        confirmLabel={t('confirmLabel')}
        danger
        onConfirm={transfer}
        onClose={() => setConfirming(false)}
      />
    </Drawer>
  );
}
