import { Suspense } from 'react';
import MobileFrame from '@/components/layout/MobileFrame';
import HostOnboardingGate from '@/components/host/HostOnboardingGate';
import HostFormSkeleton from '@/components/host/HostFormSkeleton';

export default function HostMatchPage() {
    return (
        <MobileFrame>
            <Suspense fallback={<HostFormSkeleton />}>
                <HostOnboardingGate />
            </Suspense>
        </MobileFrame>
    );
}
