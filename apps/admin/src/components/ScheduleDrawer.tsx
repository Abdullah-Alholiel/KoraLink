'use client';

import { useTranslations } from 'next-intl';
import Drawer from '@/components/Drawer';
import SlotManager from '@/components/SlotManager';
import type { PartnerSlot } from '@/lib/types';

interface ScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
  pitchId: string;
  pitchName: string;
  slots: PartnerSlot[];
  loading: boolean;
  onChanged: () => void;
  endpointBase?: '/partner' | '/admin';
}

/**
 * Standalone schedule slide-over (admin-ux-overhaul slice 7): the weekly
 * slot grid + generator open in a full-height drawer with a real close
 * affordance (X / Esc / backdrop) — no more inline accordion that pushes
 * the page down and closes only via the same button.
 */
export default function ScheduleDrawer({
  open,
  onClose,
  pitchId,
  pitchName,
  slots,
  loading,
  onChanged,
  endpointBase = '/partner',
}: ScheduleDrawerProps) {
  const t = useTranslations('schedule');
  return (
    <Drawer open={open} onClose={onClose} title={t('manageTitle', { name: pitchName })} size="lg">
      <SlotManager
        pitchId={pitchId}
        pitchName={pitchName}
        slots={slots}
        loading={loading}
        onChanged={onChanged}
        endpointBase={endpointBase}
      />
    </Drawer>
  );
}
