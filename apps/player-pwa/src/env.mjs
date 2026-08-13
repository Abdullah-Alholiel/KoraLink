import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  client: {
    NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001/api/v1'),
    NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1).default('pk_placeholder'),
    NEXT_PUBLIC_MOYASAR_KEY: z.string().min(1).default('pk_placeholder'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('https://app.koralink.sa'),
    // Observability — graceful no-op when DSNs are empty
    NEXT_PUBLIC_SENTRY_DSN: z.string().default(''),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().default(''),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().default('https://app.posthog.com'),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_MOYASAR_KEY: process.env.NEXT_PUBLIC_MOYASAR_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
