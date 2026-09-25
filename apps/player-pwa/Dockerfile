# Stage 1 – Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# --ignore-scripts: the husky prepare hook has no git repo / hooks path inside
# the image and aborts npm ci (exit 127).
RUN npm ci --ignore-scripts

# Stage 2 – Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars — NEXT_PUBLIC_* values are baked into the client bundle
# AT BUILD TIME. Supply real values via build args (Coolify build options),
# NOT runtime env: runtime env cannot reach the already-compiled client bundle
# (run #32 Reviewer B — a runtime-only NEXT_PUBLIC_API_URL ships a bundle with
# an undefined API URL = blank PWA).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_MOYASAR_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_MOYASAR_KEY=$NEXT_PUBLIC_MOYASAR_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3 – Runner (minimal production image)
FROM node:20-alpine AS runner
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
