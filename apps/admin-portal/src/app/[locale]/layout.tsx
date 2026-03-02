import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import '@/styles/globals.css';

/**
 * Primary English font — uses Outfit (load from local copy in production).
 * The font file should be placed at src/fonts/Outfit.woff2.
 * Falls back to the CSS variable if file is absent at build time.
 */
const outfit = localFont({
  src: '../../fonts/Outfit.woff2',
  variable: '--font-outfit',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

/**
 * Primary Arabic font — custom Marzouk typeface.
 * The font file should be placed at src/fonts/Marzouk.woff2.
 */
const marzouk = localFont({
  src: '../../fonts/Marzouk.woff2',
  variable: '--font-marzouk',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'KoraLink Admin Portal',
    template: '%s | KoraLink Admin',
  },
  description: 'KoraLink Administration Portal',
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
