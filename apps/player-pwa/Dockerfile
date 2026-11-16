# Stage 1 – Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
# --ignore-scripts: the husky prepare hook has no git repo / hooks path inside
# the image and aborts npm ci (exit 127).
RUN npm ci --ignore-scripts

# Stage 2 – Builder
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars — NEXT_PUBLIC_* values are baked into the client bundle
# AT BUILD TIME. Supply real values via build args (Coolify build options),
# NOT runtime env: runtime env cannot reach the already-compiled client bundle
# (run #32 Reviewer B — a runtime-only NEXT_PUBLIC_API_URL ships a bundle with
# an undefined API URL = blank PWA).
#
# Card 3 (cutover brief 2026-11-16): every NEXT_PUBLIC_* the app READS must be
# declared here — an undeclared one is silently absent from the bundle even
# when passed as a build arg. Readers: src/env.mjs (t3-oss client env),
# src/components/auth/DevLoginBar.tsx, sentry.client.config.ts. env.mjs treats
# the empty strings from unset ARGs as unset (emptyStringAsUndefined), so an
# omitted arg falls back to the zod defaults instead of failing the build.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_MOYASAR_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENV
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_MOYASAR_KEY=$NEXT_PUBLIC_MOYASAR_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENV=$NEXT_PUBLIC_SENTRY_ENV \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=$NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR \
    NEXT_TELEMETRY_DISABLED=1

# KORALINK_NO_RESTART: the postbuild hook (sync-standalone.mjs) restarts the
# systemd service on the VPS; inside Docker there is no systemd unit.
RUN KORALINK_NO_RESTART=1 npm run build

# Guard: this image builds from a PER-APP context, so the workspace-root
# inference must resolve to /app and the standalone server must land FLAT at
# .next/standalone/server.js. If Next ever changes that layout, fail the build
# here with an obvious message instead of shipping a container that cannot
# boot (the admin cutover bug, caught at build time instead).
RUN test -f .next/standalone/server.js || \
    { echo "FATAL: expected flat .next/standalone/server.js (per-app build context)"; \
      ls -R .next/standalone 2>/dev/null | head -40; exit 1; }

# The postbuild sync script copies public/static into the NESTED
# .next/standalone/apps/player-pwa path (the monorepo layout it was written
# for). In this per-app build the standalone tree is flat, so that copy is
# junk — remove it before the runner stage copies the tree into the image.
RUN rm -rf .next/standalone/apps

# Stage 3 – Runner (minimal production image)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only the standalone output and static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
