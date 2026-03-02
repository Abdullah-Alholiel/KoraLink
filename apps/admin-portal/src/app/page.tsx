import { redirect } from 'next/navigation';

/**
 * Root page — redirect to the default locale.
 * next-intl middleware will handle locale detection and redirect properly.
 */
export default function RootPage() {
  redirect('/ar');
}
