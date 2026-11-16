'use client';

import RouteError from '@/components/layout/RouteError';

// Route-scoped error boundary (P2-138 follow-up, run #192): the wallet is a
// money surface — a failed fetch/crash must stay scoped here with classified
// copy + retry, not fall to the generic (main) boundary with no recovery
// affordance (Reviewer B run-#192 P1).
export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
