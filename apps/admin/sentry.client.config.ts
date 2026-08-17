// Sentry browser init — auto-loaded by @sentry/nextjs on the client.
// Env-gated: no-op when NEXT_PUBLIC_SENTRY_DSN is empty.
// Session replay is intentionally DISABLED — the admin console renders
// sensitive user data and must never be replayed.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
