# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
# --ignore-scripts: no git hooks path inside the image (husky prepare guard).
RUN npm ci --ignore-scripts

# ── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Admin ships no public/ directory today (static assets are bundled into
# .next/standalone by sync-standalone.mjs, which tolerates a missing public/).
# The runner stage still COPYs public/ — create an empty one so the COPY can
# never break the image build (run #32 Reviewer B P1: "COPY not found").
RUN mkdir -p public

# NEXT_PUBLIC_* values are baked into the client bundle at build time.
# Card 3 (cutover brief 2026-11-16): declare every NEXT_PUBLIC_* the app
# READS — an undeclared one is silently absent from the bundle even when
# passed as a build arg. Readers: src/lib/api.ts, src/lib/use-live-data.ts,
# src/lib/ops-realtime.ts, src/components/VenueFormDrawer.tsx,
# src/providers/ObservabilityProvider.tsx, sentry.client.config.ts.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENV
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENV=$NEXT_PUBLIC_SENTRY_ENV \
    NEXT_TELEMETRY_DISABLED=1

# KORALINK_NO_RESTART: the postbuild hook (sync-standalone.mjs) restarts the
# systemd service on the VPS; inside Docker there is no systemd unit.
RUN KORALINK_NO_RESTART=1 npm run build

# outputFileTracingRoot (next.config.mjs) pins the workspace root to
# next.config.mjs's grandparent — inside this per-app image that resolves to
# "/". The standalone server therefore lands NESTED at
# .next/standalone/app/server.js, with the traced node_modules hoisted at
# .next/standalone/node_modules. Guard the layout: fail the BUILD loudly if
# it ever moves, instead of shipping a runner whose `node server.js` cannot
# find the entrypoint (the Coolify cutover bug this file fixes).
RUN test -f .next/standalone/app/server.js || \
    { echo "FATAL: expected nested .next/standalone/app/server.js (outputFileTracingRoot=/ layout)"; \
      ls -R .next/standalone 2>/dev/null | head -40; exit 1; }

# The postbuild sync script copies public/static into the NESTED
# .next/standalone/apps/admin path (the monorepo layout). In this per-app
# build the standalone app dir is "app" (singular), so that copy is junk —
# remove it before the runner stage copies the tree into the image.
RUN rm -rf .next/standalone/apps

# ── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the FULL traced standalone tree: the hoisted node_modules plus the
# nested app dir. Static assets and public/ must sit next to the NESTED
# server.js (/app/app), NOT next to WORKDIR (/app) — the standalone server
# serves both relative to its own directory.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/public ./app/public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./app/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Serve from the nested app dir (see the outputFileTracingRoot note above).
WORKDIR /app/app
CMD ["node", "server.js"]
