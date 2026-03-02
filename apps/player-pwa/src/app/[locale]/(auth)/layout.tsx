import MobileFrame from '@/components/layout/MobileFrame';

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <MobileFrame className="!bg-white">
            <main className="flex-1 overflow-y-auto scroll-container">
                {children}
            </main>
        </MobileFrame>
    );
}
