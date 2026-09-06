'use client';

/**
 * /host-guide — permanent home for the host guidelines (Abdullah
 * 2026-09-06: "if a user wants to visit it again they be able to check it
 * out" — the /host onboarding shows once, then never again).
 *
 * Renders the SAME wizard in guide mode:
 * - Back arrow → back to the profile, NEVER writes the seen-flag (a
 *   first-time host still gets the real onboarding before Host a Match).
 * - "Start Hosting" on the last slide → writes the seen-flag (they just
 *   read the guidelines) and navigates STRAIGHT to /host, where the gate
 *   now shows the form immediately.
 */

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import HostOnboarding from '@/components/host/HostOnboarding';

export default function HostGuidePage() {
    const router = useRouter();
    const locale = useLocale();

    return (
        <div className="flex h-dvh flex-col bg-brand-bg" data-testid="host-guide-page">
            <div className="flex min-h-0 flex-1 flex-col">
                <HostOnboarding
                    guide
                    onFinished={() => router.back()}
                    onStartHosting={() => router.push(`/${locale}/host`)}
                />
            </div>
        </div>
    );
}
