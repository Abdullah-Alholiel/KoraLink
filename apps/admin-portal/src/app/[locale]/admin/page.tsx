import { getTranslations } from 'next-intl/server';
import MasterSidebar from '@/components/layout/MasterSidebar';
import TopNavbar from '@/components/layout/TopNavbar';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('dashboard') };
}

export default function AdminDashboardPage() {
  return (
    <div className="flex min-h-screen bg-brand-bg">
      <MasterSidebar role="ADMIN" />
      <div className="flex flex-1 flex-col">
        <TopNavbar />
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Super Admin Dashboard
          </h1>
          <p className="mt-2 text-gray-600">HQ Mission Control</p>
        </main>
      </div>
    </div>
  );
}
