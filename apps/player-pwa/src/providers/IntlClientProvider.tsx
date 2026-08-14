'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';

interface IntlClientProviderProps {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone?: string;
  children: React.ReactNode;
}

export default function IntlClientProvider({
  locale,
  messages,
  timeZone = 'Asia/Riyadh',
  children,
}: IntlClientProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}
