# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests first for layer caching
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/dist ./dist

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs \
  && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

# D-20261121-01 (run #221): build identity for /api/v1/health `commit` — the
# release-verify EXPECTED_SHA guard (P2-387) reads it to fail a rolled-back or
# stale deploy. Render injects RENDER_GIT_COMMIT itself; on Coolify/Docker the
# image must carry the SHA: pass --build-arg GIT_SHA="$(git rev-parse HEAD)".
# PR-Agent r1 on PR #286: declared as the LAST layers so the per-commit value
# never busts the dependency/dist cache layers above (ENV with a changing
# value invalidates every layer after it).
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

# Compiled entry is dist/src/main.js — drizzle.config.ts widens tsc's rootDir
# to the package root, so the src/ segment is preserved in the output tree.
CMD ["node", "dist/src/main"]
