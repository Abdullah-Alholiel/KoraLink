#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# KoraLink — One-command local database bootstrap
#
# Usage:
#   chmod +x scripts/dev-bootstrap.sh
#   ./scripts/dev-bootstrap.sh
#
# Prerequisites:
#   - Docker + docker compose installed
#   - Node.js ≥ 20
#   - npm install run at root
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"

echo "🐘 Starting PostgreSQL + Redis..."
docker compose -f "$ROOT/docker-compose.yml" up -d postgres redis

echo "⏳ Waiting for PostgreSQL to be healthy..."
until docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U koralink -d koralink > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

echo "⏳ Waiting for Redis..."
until docker compose -f "$ROOT/docker-compose.yml" exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Redis is ready"

# ── Create .env if it doesn't exist ──────────────────────────────────────────
if [ ! -f "$API_DIR/.env" ]; then
  echo "📄 Creating .env from .env.example..."
  cp "$API_DIR/.env.example" "$API_DIR/.env"
fi

# ── Apply migrations + GiST indexes + seed ───────────────────────────────────
echo "🔄 Applying database migrations..."
cd "$API_DIR"
npx drizzle-kit migrate

echo "📍 Applying PostGIS GiST indexes..."
PGPASSWORD=koralink_dev psql -h localhost -U koralink -d koralink -f drizzle/gist_indexes.sql

echo "🌱 Seeding development data..."
npx tsx drizzle/seed.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Database bootstrap complete!"
echo ""
echo "   PostgreSQL: localhost:5432 (user: koralink, db: koralink)"
echo "   Redis:      localhost:6379"
echo ""
echo "   Next steps:"
echo "     cd apps/api && npm run dev    # Start API on :3001"
echo "     cd apps/player-pwa && npm run dev  # Start PWA on :3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
