import { Suspense } from 'react';
import MobileFrame from '@/components/layout/MobileFrame';
import HostMatchForm from '@/components/host/HostMatchForm';

/**
 * P2-26 (run #19): the Suspense fallback was `null` — the host screen flashed
 * blank while the form chunk loaded. A form-shaped skeleton matches the wallet
 * page's animate-pulse idiom and keeps the layout stable (no CLS).
 */
function HostFormSkeleton() {
    return (
        <div className="px-5 pt-[var(--top-safe-inset)] pb-8" aria-busy="true" aria-live="polite">
            {/* Title bar */}
            <div className="h-7 w-40 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-4 w-64 bg-gray-100 rounded-full mt-2 animate-pulse" />

            {/* Form card */}
            <div className="mt-6 bg-white rounded-2xl shadow-card p-5 space-y-5">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                        <div className="h-3 w-24 bg-gray-100 rounded-full animate-pulse" />
                        <div className="h-11 w-full bg-gray-200/70 rounded-xl animate-pulse" />
                    </div>
                ))}
                {/* Locked date/time summary row */}
                <div className="h-16 w-full bg-gray-100 rounded-xl animate-pulse" />
                {/* Submit CTA */}
                <div className="h-12 w-full bg-gray-200 rounded-2xl animate-pulse" />
            </div>
        </div>
    );
}

export default function HostMatchPage() {
    return (
        <MobileFrame>
            <Suspense fallback={<HostFormSkeleton />}>
                <HostMatchForm />
            </Suspense>
        </MobileFrame>
    );
}
