'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import InstallLanding from '@/components/pwa/InstallLanding';

/**
 * Shots.so-style install-flow guard (Gate 3 §2).
 *
 * Mounted in [locale]/layout.tsx around {children}. Three states:
 *  - `checking`: renders the app shell immediately (first paint IS the app —
 *    no branded flash; the manifest background_color handles boot splash).
 *  - `landing`: <InstallLanding/> renders as a FULL-VIEWPORT overlay
 *    (fixed inset-0 z-[80]) OVER the shell. Children stay mounted — the
 *    provider stack lives in this tree and must survive the post-install
 *    handoff (unmount only, no reload).
 *  - `app`: children only (standalone users, 30d-dismissed visitors).
 */
export default function InstallLandingGuard({ children }: { children: ReactNode }) {
    const { shouldShowLanding } = usePwaInstall();
    const [checked, setChecked] = useState(false);

    // One effect tick: the guard has no visual of its own until gates resolve.
    // The shell is the first paint in every state.
    useEffect(() => {
        setChecked(true);
    }, []);

    if (!checked) {
        return <div aria-busy="true">{children}</div>;
    }

    if (shouldShowLanding) {
        return (
            <>
                {children}
                <InstallLanding />
            </>
        );
    }

    return <>{children}</>;
}
