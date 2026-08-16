// Next.js instrumentation hook — initializes Sentry for the Node.js and Edge
// runtimes. The browser config is loaded separately by the SDK.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
