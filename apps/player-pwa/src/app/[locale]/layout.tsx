import type { Metadata, Viewport } from 'next';
import { Outfit, Tajawal } from 'next/font/google';
import IntlClientProvider from '@/providers/IntlClientProvider';
import QueryProvider from '@/providers/QueryProvider';
import { ObservabilityProvider } from '@/providers/ObservabilityProvider';
import AuthBootstrap from '@/components/auth/AuthBootstrap';
import '@/styles/globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  variable: '--font-tajawal',
  display: 'swap',
  weight: ['300', '400', '500', '700', '800'],
});

export const metadata: Metadata = {
  title: {
    default: 'KoraLink',
    template: '%s | KoraLink',
  },
  description: 'منصة كرة القدم الرائدة في السعودية',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KoraLink',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'KoraLink',
    title: 'KoraLink',
    description: 'منصة كرة القدم الرائدة في السعودية',
  },
};

export const viewport: Viewport = {
  themeColor: '#254132',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const locales = ['ar', 'en'] as const;

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale = (resolvedParams?.locale && locales.includes(resolvedParams.locale as (typeof locales)[number]))
    ? (resolvedParams.locale as (typeof locales)[number])
    : 'ar';

  const messages = (await import(`@/messages/${locale}.json`)).default;
  const isRtl = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`${outfit.variable} ${tajawal.variable}`}
    >
      <body className="overscroll-none">
        <QueryProvider>
          <ObservabilityProvider>
            <IntlClientProvider locale={locale} messages={messages}>
              <AuthBootstrap />
              <div className="app-shell">{children}</div>
            </IntlClientProvider>
          </ObservabilityProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
