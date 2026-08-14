'use client';

import type { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
  className?: string;
}

export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
  return (
    <div className="w-full h-[100dvh] max-h-[100dvh] bg-brand-bg flex justify-center overflow-hidden">
      <div
        className={`
          w-full max-w-6xl
          h-[100dvh] max-h-[100dvh]
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
