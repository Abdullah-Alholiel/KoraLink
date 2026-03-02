import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import '@/styles/globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const marzouk = localFont({
  src: '../../fonts/Marzouk.woff2',
  variable: '--font-marzouk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'KoraLink',
    template: '%s | KoraLink',
  },
  description: 'منصة كرة القدم الرائدة',
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
    description: 'منصة كرة القدم الرائدة',
  },
};

export const viewport: Viewport = {
  themeColor: '#00C853',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

const locales = ['ar', 'en'] as const;

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!locales.includes(params.locale as (typeof locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  const isRtl = params.locale === 'ar';

  return (
    <html
      lang={params.locale}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`${outfit.variable} ${marzouk.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
