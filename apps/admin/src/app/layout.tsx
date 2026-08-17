import type { Metadata } from 'next';
import { ObservabilityProvider } from '@/providers/ObservabilityProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'KoraLink Admin',
  description: 'KoraLink HQ operations console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ObservabilityProvider>{children}</ObservabilityProvider>
      </body>
    </html>
  );
}
