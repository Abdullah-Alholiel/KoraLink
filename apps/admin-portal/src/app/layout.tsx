/**
 * Minimal root layout — the real layout lives in [locale]/layout.tsx.
 * Required by Next.js App Router but kept intentionally bare so the
 * locale-specific layout can inject lang/dir attributes.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
