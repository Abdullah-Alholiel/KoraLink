import type { Metadata } from 'next';
import { ObservabilityProvider } from '@/providers/ObservabilityProvider';
import AdminI18nProvider from '@/i18n/AdminI18nProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'KoraLink Admin',
  description: 'KoraLink HQ operations console',
};

/**
 * Pre-hydration locale sync: runs before first paint so an Arabic user
 * with a persisted `admin_locale=ar` gets dir=rtl immediately (no LTR
 * flash). Kept tiny and dependency-free on purpose.
 */
const LOCALE_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem('admin_locale');if(v==='ar'){document.documentElement.lang='ar';document.documentElement.dir='rtl';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOT_SCRIPT }} />
      </head>
      <body>
        <AdminI18nProvider>
          <ObservabilityProvider>{children}</ObservabilityProvider>
        </AdminI18nProvider>
      </body>
    </html>
  );
}
