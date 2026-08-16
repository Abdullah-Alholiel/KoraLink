'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-height class (literal, so Tailwind JIT generates it). Default 'max-h-[85dvh]'. */
  maxHeightClass?: string;
  /** Sheet panel max-width class. Default 'max-w-2xl'. */
  widthClass?: string;
  /** Extra classes for the white panel (e.g. 'bg-brand-bg'). */
  panelClassName?: string;
  /** Extra classes for the backdrop (e.g. 'bg-black/60 backdrop-blur-xs'). */
  backdropClassName?: string;
  /** Whether tapping the backdrop dismisses the sheet. Default true. */
  dismissOnBackdrop?: boolean;
}

/**
 * Canonical bottom sheet for KoraLink.
 *
 * Renders through a React portal to `document.body` so the `position: fixed`
 * overlay is always positioned against the viewport — never against an
 * ancestor `scroll-container` / `will-change-transform` element (the iOS
 * Safari bug that clipped sheets like POTM voting/results).
 *
 * The panel is `flex flex-col max-h-[XXdvh]`; put fixed chrome (pull handle,
 * header, footer CTA) directly as children with `flex-shrink-0`, and put
 * scrollable content in a `<div className="flex-1 overflow-y-auto scroll-container">`.
 */
export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeightClass = 'max-h-[85dvh]',
  widthClass = 'max-w-2xl',
  panelClassName = '',
  backdropClassName = 'bg-black/50',
  dismissOnBackdrop = true,
}: BottomSheetProps) {
  if (!open) return null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 ${backdropClassName} z-[60] animate-fade-in`}
        onClick={dismissOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4"
      >
        <div
          className={`w-full ${widthClass} bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col ${maxHeightClass} pb-safe ${panelClassName}`}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
