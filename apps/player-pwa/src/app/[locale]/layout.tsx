import type { Metadata, Viewport } from 'next';
import { Outfit, Tajawal } from 'next/font/google';
import IntlClientProvider from '@/providers/IntlClientProvider';
import QueryProvider from '@/providers/QueryProvider';
import { ObservabilityProvider } from '@/providers/ObservabilityProvider';
import AuthBootstrap from '@/components/auth/AuthBootstrap';
import ViewportHeight from '@/components/layout/ViewportHeight';
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

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: 'KoraLink',
      template: '%s | KoraLink',
    },
    description: 'منصة كرة القدم الرائدة في السعودية',
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      shortcut: '/favicon.ico',
      apple: [
        { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
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
}

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
              <ViewportHeight />
              <div className="app-shell">{children}</div>
            </IntlClientProvider>
          </ObservabilityProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
