# Project Janus

ARG-терминал: сайт, имитирующий интерфейс сверхсекретного суперкомпьютера времён СФРЮ.
Игрок регистрируется, получает случайную роль, общается с ИИ и разбирает файлы архива через
файловый менеджер. Это MVP первой волны разработки — только сайт-терминал, без мобильного
приложения и системы кодов доступа (см. ТЗ).

## Стек

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`)
- Anthropic API (`@anthropic-ai/sdk`) — диалоговый движок
- Vitest — юнит-тесты

## Требования

- Node.js 20+
- Docker + Docker Compose v2 (`docker compose ...`, не старый `docker-compose`) — для
  локального Postgres, либо любой другой доступный PostgreSQL-сервер
- Ключ Anthropic API (`ANTHROPIC_API_KEY`)

## Быстрый старт

Само приложение не контейнеризовано — в Docker живёт только Postgres, сайт запускается как
обычный Node-процесс (это одинаково верно и локально, и на сервере).

**Самый быстрый способ** — один скрипт, который сам поднимет Postgres (через
`docker-compose.yml`, с персистентным томом), применит миграции, засеет справочные данные и
запустит сайт:

```powershell
# Windows
scripts\start.bat        REM dev-режим (npm run dev, hot-reload) — по умолчанию
scripts\start.bat prod   REM production-сборка + npm run start
```

```bash
# Linux / macOS / удалённый сервер
./scripts/start.sh        # dev-режим — по умолчанию
./scripts/start.sh prod   # production-сборка + npm run start
```

Скрипт сам скопирует `.env.example` → `.env` при первом запуске (не забудьте потом заполнить
`ANTHROPIC_API_KEY`) и поставит зависимости, если `node_modules` ещё нет.

**Как остановить:**

- **Windows** (`start.bat`) — сайт запускается в отдельном окне, а в окне со `start.bat`
  выводится «Press any key to stop...». Нажмите любую клавишу в этом окне — скрипт сам закроет
  сайт и остановит Postgres.
- **Linux/macOS** (`start.sh`) — сайт работает в том же окне; просто нажмите `Ctrl+C` — база
  остановится автоматически следом (через `trap` на выход скрипта).

Если окно закрыли иначе (крестиком) и сайт/БД остались висеть — `scripts\stop.bat` /
`./scripts/stop.sh` подчистят и то, и другое (данные в томе Postgres сохранятся).

> **Если у вас уже есть контейнер `janus-postgres`, созданный старой ручной командой
> `docker run`** (без docker-compose) — его нужно один раз удалить перед первым запуском
> скрипта, иначе `docker compose` упадёт с конфликтом имён: `docker rm -f janus-postgres` (том
> у старого контейнера не был именованным, так что данные всё равно не персистентны —
> переживать не о чем).

<details>
<summary>Вручную, шаг за шагом (то же самое, без скрипта)</summary>

```bash
cp .env.example .env
# заполнить ANTHROPIC_API_KEY, AUTH_SECRET в .env (POSTGRES_*/DATABASE_URL уже согласованы)

npm install

docker compose up -d --wait db

npx prisma migrate deploy
npm run prisma:seed

npm run dev
```

</details>

Открыть [http://localhost:3000](http://localhost:3000) — сайт редиректит на `/login`.

## Деплой на удалённый сервер

Специфики под конкретный хостинг пока нет — окружение спроектировано переносимым: тот же
`docker-compose.yml` и тот же `scripts/start.sh` работают на любом Linux-сервере с установленным
Docker. Разница с локальной разработкой только в режиме запуска сайта:

```bash
git clone <repo> && cd "Project Janus"
cp .env.example .env
# заполнить .env реальными секретами (AUTH_SECRET, ANTHROPIC_API_KEY, при необходимости — свои POSTGRES_*)

./scripts/start.sh prod
```

`prod`-режим собирает `npm run build` и запускает `npm run start` (без hot-reload, как и
положено на сервере). Docker-демон должен быть уже запущен — скрипт **не** пытается поднимать
его через `sudo` сам. Процесс, запущенный `npm run start`, стоит держать под присмотром
супервизора (`pm2`, `systemd`-юнит и т.п.) — это пока не автоматизировано.

## Переменные окружения (`.env`)

| Переменная          | Назначение                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`      | Строка подключения к PostgreSQL — должна быть согласована с `POSTGRES_*` ниже |
| `POSTGRES_USER`     | Пользователь БД (читает `docker-compose.yml`)                                 |
| `POSTGRES_PASSWORD` | Пароль БД (читает `docker-compose.yml`)                                       |
| `POSTGRES_DB`       | Имя БД (читает `docker-compose.yml`)                                          |
| `POSTGRES_PORT`     | Порт, на который Postgres пробрасывается на хост (по умолчанию `5432`)        |
| `ANTHROPIC_API_KEY` | Ключ Anthropic API для диалогового движка (`/lib/ai`)                         |
| `AUTH_SECRET`       | Секрет для подписи сессионных JWT (сгенерировать: `openssl rand -base64 32`)  |

## Скрипты

| Команда                  | Назначение                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `scripts/start.bat\|.sh` | Поднять окружение (Postgres, миграции, сид) и запустить сайт — `dev` или `prod`    |
| `scripts/stop.bat\|.sh`  | Остановить контейнер Postgres (данные сохраняются)                                 |
| `npm run dev`            | Dev-сервер (Next.js + Turbopack) — без окружения, если оно уже поднято             |
| `npm run build`          | Production-сборка                                                                  |
| `npm run start`          | Production-сервер (после `build`)                                                  |
| `npm run lint`           | ESLint                                                                             |
| `npm run format`         | Prettier (запись)                                                                  |
| `npm run format:check`   | Prettier (проверка без записи)                                                     |
| `npm run test`           | Юнит-тесты (Vitest)                                                                |
| `npm run prisma:seed`    | Засеять БД дефолтными модулями и черновым контентом файловой системы               |
| `npm run metrics`        | Базовые метрики MVP (доля дошедших до файлового менеджера, доля повторных логинов) |

## Структура проекта

```
docker-compose.yml        — Postgres для dev/сервера (persistent volume, healthcheck)
/scripts
  start.bat, start.sh      — поднять окружение + запустить сайт (dev|prod)
  stop.bat, stop.sh        — остановить Postgres
  metrics.ts               — расчёт базовых метрик
/app
  /terminal              — оболочка терминала (хаб/приветствие)
    /chat                — экран диалога с ИИ
    /files               — экран файлового менеджера
  /api
    /chat                — эндпоинт диалога с ИИ
    /terminal
      /modules           — список модулей, разблокированных игроком
      /files             — листинг папок/файлов, открытие, анализ
    /auth                — регистрация/логин/логаут
  /(auth)/login, /(auth)/register
/lib
  /ai                    — промпт-слой, клиент Anthropic API, рейт-лимит чата
  /auth                  — сессии (JWT), пароли, назначение роли
  /db                    — Prisma client (singleton)
  /modules               — реестр командных модулей, проверка доступа
  /chat                  — работа с активной сессией диалога
  /analytics             — трекинг событий MVP
/prisma
  schema.prisma, migrations/, seed.ts
/content
  seed-files.json        — черновой контент файловой системы терминала (TODO: финальные тексты)
```

## Тестирование и приёмка

Юнит-тесты покрывают проверку доступа к модулям/файлам (`lib/modules`) и API-роуты файлового
менеджера (мок Prisma/сессии). Приёмочный сценарий MVP — регистрация → приветствие → диалог с
ИИ → файловый менеджер (анализ файла) → возврат в хаб → логаут → повторный логин с сохранённым
состоянием — прогоняется вручную и должен проходить без ошибок перед релизом; см. раздел
«Определяющий сценарий MVP» в ТЗ.

## Вне рамок этого MVP

Мобильное приложение, система кодов доступа между сайтом и приложением, поручения от ИИ,
полноценные недефолтные модули (`MAP_VIEWER`, `SEARCH`, `MEMORY_MANAGER` — пока только заглушки
с корректным сообщением об отказе), полный список ролей (сейчас 3 из 9), монетизация,
публичный лендинг. Подробности — см. ТЗ, раздел «Явно вне рамок этого ТЗ».
