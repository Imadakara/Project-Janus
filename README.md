# Project Janus

ARG

## Быстрый старт (dev)

```bash
cp .env.example .env
# заполнить DATABASE_URL, ANTHROPIC_API_KEY, AUTH_SECRET в .env

npm install

# локальный Postgres для разработки (один раз)
docker run -d --name janus-postgres \
  -e POSTGRES_USER=janus -e POSTGRES_PASSWORD=janus_dev_password \
  -e POSTGRES_DB=project_janus -p 5432:5432 postgres:16-alpine

npx prisma migrate dev
npx tsx prisma/seed.ts

npm run dev
```

Подробная инструкция запуска — см. Фазу 7 ТЗ (`README` будет дополнен там).
