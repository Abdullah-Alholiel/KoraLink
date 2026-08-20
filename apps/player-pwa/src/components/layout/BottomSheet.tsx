'use client';

import { useRef, useEffect } from 'react';
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

/** px from the sheet top that starts a drag-to-dismiss gesture. */
const HANDLE_ZONE = 48;
/** px of downward drag required to dismiss on release. */
const DISMISS_DISTANCE = 80;
/** px/ms flick velocity required to dismiss on release. */
const DISMISS_VELOCITY = 0.5;
/** spring-back / close animation duration. */
const SETTLE_MS = 220;

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
 * scrollable content in a `<div className="flex-1 overflow-y-auto scroll-container min-h-0">`.
 * `min-h-0` is REQUIRED on the scroll body — without it the flex item keeps its
 * content height (Safari's `min-height: auto` quirk) and the list overflows
 * instead of scrolling.
 *
 * Drag-to-dismiss: touching within the top HANDLE_ZONE (the notch/header area)
 * and dragging down translates the sheet with the finger; releasing past the
 * threshold (or with a fast downward flick) closes it, otherwise it springs back.
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose without re-subscribing listeners on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!el) return;

    const drag = { active: false, startY: 0, offset: 0, lastY: 0, lastT: 0, velocity: 0 };

    const onStart = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const y = e.touches[0].clientY;
      if (y - rect.top <= HANDLE_ZONE) {
        drag.active = true;
        drag.startY = y;
        drag.offset = 0;
        drag.lastY = y;
        drag.lastT = performance.now();
        drag.velocity = 0;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!drag.active) return;
      const y = e.touches[0].clientY;
      const delta = y - drag.startY;
      if (delta <= 0) return; // only downward drag dismisses
      drag.offset = delta;

      const now = performance.now();
      const dt = now - drag.lastT;
      if (dt > 0) drag.velocity = (y - drag.lastY) / dt;
      drag.lastY = y;
      drag.lastT = now;

      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      if (backdrop) {
        backdrop.style.transition = 'none';
        backdrop.style.opacity = String(Math.max(0.2, 1 - delta / 250));
      }
      e.preventDefault();
    };

    const onEnd = () => {
      if (!drag.active) return;
      drag.active = false;
      if (drag.offset === 0) return; // a tap, not a drag

      const dismiss = drag.offset > DISMISS_DISTANCE || drag.velocity > DISMISS_VELOCITY;
      el.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      if (backdrop) backdrop.style.transition = `opacity ${SETTLE_MS}ms ease`;

      if (dismiss) {
        el.style.transform = 'translateY(100%)';
        if (backdrop) backdrop.style.opacity = '0';
        window.setTimeout(() => onCloseRef.current(), SETTLE_MS);
      } else {
        el.style.transform = 'translateY(0)';
        if (backdrop) backdrop.style.opacity = '1';
        window.setTimeout(() => {
          el.style.transition = '';
          el.style.transform = '';
          if (backdrop) {
            backdrop.style.transition = '';
            backdrop.style.opacity = '';
          }
        }, SETTLE_MS);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={`fixed inset-0 ${backdropClassName} z-[60] animate-fade-in`}
        onClick={dismissOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-md mx-auto px-0"
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
