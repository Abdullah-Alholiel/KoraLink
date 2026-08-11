import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import Toast from '@/components/layout/Toast';

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ErrorBoundary>
            <MobileFrame>
                <main className="flex-1 overflow-y-auto scroll-container bg-brand-bg">
                    {children}
                </main>
                <BottomNav />
                <Toast />
            </MobileFrame>
        </ErrorBoundary>
    );
}
