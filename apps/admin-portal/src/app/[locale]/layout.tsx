import type { Metadata } from 'next';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import '@/styles/globals.css';

/**
 * Primary English font — served from local copy.
 * Replace src/fonts/Outfit.woff2 with the licensed file for production.
 */
const outfit = localFont({
  src: '../../fonts/Outfit.woff2',
  variable: '--font-outfit',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});

/**
 * Primary Arabic font — custom Marzouk typeface.
 * Replace src/fonts/Marzouk.woff2 with the licensed file for production.
 */
const marzouk = localFont({
  src: '../../fonts/Marzouk.woff2',
  variable: '--font-marzouk',
  display: 'swap',
  adjustFontFallback: false,
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

  // Read the per-request nonce injected by middleware.
  // Used to allowlist Next.js inline scripts in the nonce-based CSP.
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html
      lang={locale}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`${outfit.variable} ${marzouk.variable}`}
    >
      <head>
        {nonce && (
          <meta name="next-js-nonce" content={nonce} />
        )}
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
