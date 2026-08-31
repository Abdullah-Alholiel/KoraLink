'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * RTL-native slide-over panel: anchored to the inline end (right in LTR,
 * left in RTL) via `end-0`, translated with an inline-direction-safe trick
 * (translate-x with dir-scoped flips). Esc, backdrop, and X all close it.
 * Focus is trapped inside while open.
 */
export default function Drawer({ open, onClose, title, subtitle, size = 'md', children, footer }: DrawerProps) {
  const t = useTranslations('drawer');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Prevent the page behind from scrolling while the drawer is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Focus the panel on open so Esc works immediately and screen readers land here.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50 animate-[fade-in_.15s_ease-out]" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 end-0 flex w-full max-w-xl flex-col bg-white shadow-2xl outline-none',
          size === 'lg' && 'max-w-3xl',
          // Inline-direction-aware entrance: slides from the end side.
          'rtl:animate-[slide-in-end_.22s_ease-out] ltr:animate-[slide-in-end_.22s_ease-out]',
        )}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={t('closeAria')}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
