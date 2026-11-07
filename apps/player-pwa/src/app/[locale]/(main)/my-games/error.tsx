'use client';

import RouteError from '@/components/layout/RouteError';

// Route-scoped error boundary (P2-138 follow-up, run #192): my-games has a
// loading skeleton but no crash boundary — a failed fetch fell to the
// generic (main) boundary with no scoped retry (Reviewer B run-#192 P1).
export default function MyGamesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
