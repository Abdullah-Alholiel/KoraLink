#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# KoraLink — Full local dev startup (database + API + PWA)
#
# Usage:
#   chmod +x scripts/start.sh && ./scripts/start.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"

echo "📦 Pulling latest code..."
cd "$ROOT"
git pull origin main

echo "📦 Installing dependencies..."
npm install

# ── Create PWA .env.local if missing ─────────────────────────────────────────
if [ ! -f "$ROOT/apps/player-pwa/.env.local" ]; then
  echo "http://localhost:3001/api/v1" > "$ROOT/apps/player-pwa/.env.local"
  echo "📄 Created apps/player-pwa/.env.local"
fi

# ── Create API .env if missing ───────────────────────────────────────────────
if [ ! -f "$API_DIR/.env" ]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  echo "📄 Created apps/api/.env"
fi

# ── Start PostgreSQL + Redis ─────────────────────────────────────────────────
echo "🐘 Starting PostgreSQL + Redis..."
docker compose -f "$ROOT/docker-compose.yml" up -d postgres redis 2>/dev/null || {
  echo "❌ Docker not running. Start Docker Desktop first."
  exit 1
}

echo "⏳ Waiting for PostgreSQL..."
until docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U koralink -d koralink > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL ready"

# ── Migrate + Seed ───────────────────────────────────────────────────────────
echo "🔄 Applying migrations..."
cd "$API_DIR"
npx drizzle-kit migrate

echo "📍 Applying GiST indexes..."
docker compose -f "$ROOT/docker-compose.yml" exec -T postgres psql -U koralink -d koralink -f /docker-entrypoint-initdb.d/01_gist_indexes.sql 2>/dev/null || true

echo "🌱 Seeding data..."
DATABASE_URL=postgresql://koralink:koralink_dev@localhost:5432/koralink npx tsx drizzle/seed.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Everything ready! Starting API + PWA..."
echo ""
echo "   Open: http://localhost:3000/en/login"
echo "   Click: 'Login as Ahmed Al-Rashid' to sign in"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$ROOT"
npm run dev
