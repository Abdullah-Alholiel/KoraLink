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

// Slide-in from the physical LEFT edge. Scoped to this component (globals.css
// still carries the legacy `slide-in-end` keyframe); same 0.22s ease-out
// timing as the shared motion tokens. Physical translateX, not dir-scoped, so
// LTR and RTL behave identically.
const SLIDE_IN_LEFT_KEYFRAMES = `@keyframes drawer-slide-in-left {
  from { transform: translateX(-100%); opacity: 0.7; }
  to { transform: translateX(0); opacity: 1; }
}`;

/**
 * Slide-over panel LEFT-anchored in both locales (physical left-0, Abdullah's
 * standing UI standard: drawers are left-anchored in LTR and RTL). Slides in
 * from the left edge with a physical transform. Esc, backdrop, and X all
 * close it. Focus is trapped inside while open.
 */
export default function Drawer({ open, onClose, title, subtitle, size = 'md', children, footer }: DrawerProps) {
  const t = useTranslations('drawer');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Focus trap: keep Tab cycling inside the panel (P2-69, run #54 — the
      // docstring always claimed trapping; this implements it).
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
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
    // The overlay starts AFTER the sidebar column (left-64) on desktop: the
    // main menu stays pinned left and fully visible/clickable while a drawer
    // is open (Abdullah 2026-08-31: "i always need the main menu to be
    // shown"). Below md the sidebar is hidden (2026-09-07), so the overlay
    // starts at left-0 and the drawer spans the full viewport width.
    <div
      className="fixed inset-y-0 left-0 right-0 z-[80] md:left-64"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <style>{SLIDE_IN_LEFT_KEYFRAMES}</style>
      <div className="absolute inset-0 bg-black/50 animate-[fade-in_.15s_ease-out]" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          // LEFT-anchored panel in both locales (physical left-0).
          'absolute inset-y-0 left-0 flex w-full max-w-xl flex-col bg-white shadow-2xl outline-none',
          size === 'lg' && 'max-w-3xl',
          // Slides in from the left edge (keyframe defined above).
          'animate-[drawer-slide-in-left_.22s_ease-out]',
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
