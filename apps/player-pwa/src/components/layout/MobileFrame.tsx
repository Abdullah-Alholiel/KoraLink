'use client';

import type { ReactNode } from 'react';

interface MobileFrameProps {
    children: ReactNode;
    className?: string;
}

export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
    return (
        <div
            className={`
        mx-auto w-full max-w-md
        min-h-[100dvh] h-[100dvh]
        bg-white shadow-xl
        relative overflow-hidden
        flex flex-col
        ${className}
      `}
        >
            {children}
        </div>
    );
}
