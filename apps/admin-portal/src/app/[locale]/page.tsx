import { redirect } from 'next/navigation';

/**
 * Default locale root page — redirect to the login page.
 * The middleware handles authenticated users by redirecting to their dashboard.
 */
export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/login`);
}
