import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <MobileFrame>
            <main className="flex-1 overflow-y-auto scroll-container bg-brand-bg">
                {children}
            </main>
            <BottomNav />
        </MobileFrame>
    );
}
