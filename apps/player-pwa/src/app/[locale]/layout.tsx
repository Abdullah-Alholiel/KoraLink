import type { Metadata, Viewport } from 'next';
import { Outfit, Tajawal } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import QueryProvider from '@/providers/QueryProvider';
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
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const locales = ['ar', 'en'] as const;

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  const messages = await getMessages();
  const isRtl = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`${outfit.variable} ${tajawal.variable}`}
    >
      <body className="overscroll-none">
        <QueryProvider>
          <NextIntlClientProvider messages={messages}>
            <div className="app-shell">{children}</div>
          </NextIntlClientProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
