'use client';

/**
 * /host-guide — permanent home for the host guidelines (P: Abdullah
 * 2026-09-06: "if a user wants to visit it again they be able to check it
 * out" — the /host onboarding shows once, then never again).
 *
 * Renders the SAME wizard in guide mode: exiting (back arrow) or finishing
 * the last slide navigates back, and NEITHER writes the seen-flag — so a
 * first-time host who reads the guide from their profile still gets the
 * real onboarding before Host a Match. Entry: Profile → Host Guide.
 */

import { useRouter } from 'next/navigation';
import HostOnboarding from '@/components/host/HostOnboarding';

export default function HostGuidePage() {
    const router = useRouter();

    return (
        <div className="flex h-dvh flex-col bg-brand-bg" data-testid="host-guide-page">
            <div className="flex min-h-0 flex-1 flex-col">
                <HostOnboarding guide onFinished={() => router.back()} />
            </div>
        </div>
    );
}
