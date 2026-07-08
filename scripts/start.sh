#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/start.sh [dev|prod]   (default: dev)

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
  echo "[start] docker не найден в PATH. Установите Docker и повторите." >&2
  exit 1
}

docker compose version >/dev/null 2>&1 || {
  echo "[start] Docker Compose v2 plugin не найден (нужен 'docker compose', не 'docker-compose')." >&2
  exit 1
}

if ! docker info >/dev/null 2>&1; then
  echo "[start] Docker daemon недоступен. Запустите его (например, 'sudo systemctl start docker') и повторите." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "[start] .env не найден, копирую из .env.example"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "[start] Устанавливаю зависимости..."
  npm install
fi

if docker inspect janus-postgres >/dev/null 2>&1; then
  compose_label="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' janus-postgres 2>/dev/null || true)"
  if [ -z "$compose_label" ]; then
    echo "[start] Найден контейнер janus-postgres, созданный не через docker compose (старый ручной 'docker run')." >&2
    echo "[start] Удалите его один раз перед первым запуском: docker rm -f janus-postgres" >&2
    exit 1
  fi
fi

echo "[start] Поднимаю Postgres..."
docker compose up -d --wait --wait-timeout 90 db

echo "[start] Применяю миграции..."
npx prisma migrate deploy

echo "[start] Засеваю справочные данные..."
npm run prisma:seed

if [ "$MODE" = "dev" ]; then
  echo "[start] Запускаю dev-сервер..."
  exec npm run dev
else
  echo "[start] Собираю production-бандл..."
  npm run build
  echo "[start] Запускаю production-сервер..."
  exec npm run start
fi
