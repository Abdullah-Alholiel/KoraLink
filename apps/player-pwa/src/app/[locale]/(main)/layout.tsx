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
        <ErrorBoundary>
            <MobileFrame>
                <AuthGuard>
                    <NotificationProvider>
                        <BadgeHydrator />
                        <ScrollableMain>{children}</ScrollableMain>
                        <BottomNav />
                        <Toast />
                        <WelcomeCheckpoint />
                    </NotificationProvider>
                </AuthGuard>
            </MobileFrame>
        </ErrorBoundary>
    );
}
