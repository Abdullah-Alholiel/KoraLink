import type { Metadata, Viewport } from 'next';
import { Outfit, Tajawal } from 'next/font/google';
import IntlClientProvider from '@/providers/IntlClientProvider';
import QueryProvider from '@/providers/QueryProvider';
import { ObservabilityProvider } from '@/providers/ObservabilityProvider';
import { LocationProvider } from '@/providers/LocationProvider';
import AuthBootstrap from '@/components/auth/AuthBootstrap';
import ServiceWorkerUpdater from '@/components/auth/ServiceWorkerUpdater';
import ChunkLoadErrorHandler from '@/components/auth/ChunkLoadErrorHandler';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import InstallLandingGuard from '@/components/pwa/InstallLandingGuard';
import ViewportHeightSync from '@/components/layout/ViewportHeightSync';
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
  interactiveWidget: 'resizes-content',
};

const locales = ['ar', 'en'] as const;

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
        {/* iOS PWA standalone meta tags — rendered directly in the JSX so they
            are present in the initial HTML (the metadata export is streamed for
            this dynamic [locale] layout, which iOS Safari does not read). */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KoraLink" />
        {/* iOS PWA launch splash screens — without these Apple white-flashes on
            launch. Exact device sizes + media queries (Apple requires both). */}
        <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" href="/icons/splash-1290x2796.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" href="/icons/splash-1179x2556.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" href="/icons/splash-1284x2778.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" href="/icons/splash-1170x2532.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" href="/icons/splash-828x1792.png" />
        <QueryProvider>
          <ObservabilityProvider>
            <IntlClientProvider locale={locale} messages={messages}>
              <LocationProvider>
                <AuthBootstrap />
                <ViewportHeightSync />
                <ServiceWorkerUpdater />
                <ChunkLoadErrorHandler />
                <InstallLandingGuard>
                  <InstallPrompt />
                  <div className="app-shell">{children}</div>
                </InstallLandingGuard>
              </LocationProvider>
            </IntlClientProvider>
          </ObservabilityProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
