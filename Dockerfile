# ── Stage 1: Build (monorepo root context) ──────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root manifests and API workspace manifests
COPY package*.json turbo.json ./
COPY apps/api/package*.json apps/api/

RUN npm ci --ignore-scripts

# Copy API source + tsconfig
COPY apps/api apps/api

WORKDIR /app/apps/api
RUN npm run build

# ── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Root workspace + API workspace manifests for npm ci
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/apps/api/package*.json ./apps/api/

RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs \
  && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

# Compiled entry is dist/src/main.js — drizzle.config.ts widens tsc's rootDir
# to the package root, so the src/ segment is preserved in the output tree.
WORKDIR /app/apps/api
CMD ["node", "dist/src/main"]
