import { Suspense } from 'react';
import MobileFrame from '@/components/layout/MobileFrame';
import HostMatchForm from '@/components/host/HostMatchForm';

export default function HostMatchPage() {
    return (
        <MobileFrame>
            <Suspense fallback={null}>
                <HostMatchForm />
            </Suspense>
        </MobileFrame>
    );
}
