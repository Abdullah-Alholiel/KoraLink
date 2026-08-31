'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Accessible confirmation dialog — replaces window.confirm/alert everywhere
 * in the console (RTL-aware, Esc/backdrop close, danger variant).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const t = useTranslations('confirm');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 animate-[fade-in_.15s_ease-out]" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl animate-[scale-in_.15s_ease-out]">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {message && <p className="mt-1.5 text-sm text-gray-500">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('cancelLabel')}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={
              danger
                ? 'rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700'
                : 'rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
