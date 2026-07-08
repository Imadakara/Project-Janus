#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/start.sh [dev|prod]   (default: dev)
# Starts the environment (Postgres, migrations, seed) and the site in the
# foreground. Press Ctrl+C to stop the site - the database is stopped
# automatically afterwards (see the cleanup trap below).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

MODE="${1:-dev}"
case "$MODE" in
  dev|prod) ;;
  *)
    echo "Usage: $0 [dev|prod]" >&2
    exit 1
    ;;
esac

command -v docker >/dev/null 2>&1 || {
  echo "[start] docker not found in PATH. Install Docker and try again." >&2
  exit 1
}

docker compose version >/dev/null 2>&1 || {
  echo "[start] Docker Compose v2 plugin not found (need 'docker compose', not 'docker-compose')." >&2
  exit 1
}

if ! docker info >/dev/null 2>&1; then
  echo "[start] Docker daemon is not reachable. Start it (e.g. 'sudo systemctl start docker') and try again." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "[start] .env not found, copying from .env.example"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "[start] Installing dependencies..."
  npm install
fi

if docker inspect janus-postgres >/dev/null 2>&1; then
  compose_label="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' janus-postgres 2>/dev/null || true)"
  if [ -z "$compose_label" ]; then
    echo "[start] Found a janus-postgres container that wasn't created by docker compose (old manual 'docker run')." >&2
    echo "[start] Remove it once before the first run: docker rm -f janus-postgres" >&2
    exit 1
  fi
fi

cleanup() {
  echo "[start] Stopping database..."
  docker compose stop
}
trap cleanup EXIT

echo "[start] Starting Postgres..."
docker compose up -d --wait --wait-timeout 90 db

echo "[start] Applying migrations..."
npx prisma migrate deploy

echo "[start] Seeding reference data..."
npm run prisma:seed

echo "[start] Press Ctrl+C to stop the server and the database."

if [ "$MODE" = "dev" ]; then
  echo "[start] Starting dev server..."
  npm run dev
else
  echo "[start] Building production bundle..."
  npm run build
  echo "[start] Starting production server..."
  npm run start
fi
