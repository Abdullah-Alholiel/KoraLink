import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  client: {
    NEXT_PUBLIC_API_URL: z.string().url().default('https://api.koralink.sa'),
    NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1).default('pk_placeholder'),
    NEXT_PUBLIC_MOYASAR_KEY: z.string().min(1).default('pk_placeholder'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('https://app.koralink.sa'),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_MOYASAR_KEY: process.env.NEXT_PUBLIC_MOYASAR_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
