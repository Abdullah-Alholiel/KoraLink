import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import Toast from '@/components/layout/Toast';
import AuthGuard from '@/components/auth/AuthGuard';
import ScrollableMain from '@/components/layout/ScrollableMain';
import NotificationProvider from '@/providers/NotificationProvider';
import BadgeHydrator from '@/components/layout/BadgeHydrator';
import WelcomeCheckpoint from '@/components/pwa/WelcomeCheckpoint';

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ErrorBoundary
            titleKey="title"
            descriptionKey="pageDescription"
            retryKey="retry"
        >
            <MobileFrame>
                <AuthGuard>
                    <NotificationProvider>
                        <BadgeHydrator />
                        {/* Surface boundary: a crash in the routed content renders the
                            fallback in the scroll slot; BottomNav/Toast/WelcomeCheckpoint
                            stay mounted. The outer boundary remains the last resort for
                            chrome crashes. */}
                        <ErrorBoundary
                            variant="surface"
                            titleKey="title"
                            descriptionKey="description"
                            retryKey="retry"
                        >
                            <ScrollableMain>{children}</ScrollableMain>
                        </ErrorBoundary>
                        <BottomNav />
                        <Toast />
                        <WelcomeCheckpoint />
                    </NotificationProvider>
                </AuthGuard>
            </MobileFrame>
        </ErrorBoundary>
    );
}
