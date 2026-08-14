'use client';

import type { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
  className?: string;
}

export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
  return (
    <div className="w-full h-[var(--app-height)] max-h-[var(--app-height)] bg-brand-bg flex justify-center overflow-hidden">
      <div
        className={`
          w-full max-w-6xl
          h-[var(--app-height)] max-h-[var(--app-height)]
          bg-white shadow-sm
          relative overflow-hidden
          flex flex-col flex-1
          ${className}
        `}
      >
        {children}
      </div>
    </div>
  );
}
