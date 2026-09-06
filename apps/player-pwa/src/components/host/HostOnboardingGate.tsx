'use client';

/**
 * Gate for the host screen: first-time hosts see the onboarding wizard,
 * everyone who finished (or skipped) it goes straight to the form.
 *
 * The seen-flag lives in localStorage, which is browser-only — reading it in
 * initial state would render different trees on server vs client (hydration
 * mismatch, see hydration-conditional-render reference). Instead the gate
 * starts in a third "deciding" state that renders the same HostFormSkeleton
 * the Suspense boundary shows, then resolves in a mount effect. The wizard
 * signals completion via callback — we are already on /host, so no
 * navigation is needed and the swap is instant.
 */

import { useEffect, useState } from 'react';
import HostMatchForm from './HostMatchForm';
import HostOnboarding, { readHostOnboardingSeen } from './HostOnboarding';
import HostFormSkeleton from './HostFormSkeleton';

export default function HostOnboardingGate() {
    /* null = deciding (post-hydration check pending), true = seen, false = show wizard */
    const [seen, setSeen] = useState<boolean | null>(null);

    useEffect(() => {
        setSeen(readHostOnboardingSeen());
    }, []);

    if (seen === null) return <HostFormSkeleton />;
    if (seen) return <HostMatchForm />;
    return <HostOnboarding onFinished={() => setSeen(true)} />;
}
