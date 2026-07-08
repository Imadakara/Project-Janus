@echo off
setlocal EnableExtensions

REM Usage: scripts\start.bat [dev|prod]   (default: dev)

cd /d "%~dp0.."

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"
if /I not "%MODE%"=="dev" if /I not "%MODE%"=="prod" (
  echo Usage: scripts\start.bat [dev^|prod]
  exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [start] Docker не найден в PATH. Установите Docker Desktop и повторите.
  exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo [start] Docker Compose v2 plugin не найден ^(нужен "docker compose", не "docker-compose"^).
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 goto startdocker
goto dockerready

:startdocker
echo [start] Docker daemon недоступен, пробую запустить Docker Desktop...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>nul | find /I "Docker Desktop.exe" >nul
if not errorlevel 1 goto waitdaemon
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  echo [start] Docker Desktop.exe не найден. Запустите Docker вручную и повторите.
  exit /b 1
)
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

:waitdaemon
set /a ATTEMPTS=0
:waitdaemonloop
set /a ATTEMPTS+=1
docker info >nul 2>&1
if not errorlevel 1 goto dockerready
if %ATTEMPTS% GEQ 40 (
  echo [start] Docker daemon так и не поднялся за отведённое время.
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto waitdaemonloop

:dockerready
if not exist ".env" (
  echo [start] .env не найден, копирую из .env.example
  copy /y ".env.example" ".env" >nul
)

if not exist "node_modules\" (
  echo [start] Устанавливаю зависимости...
  call npm install
  if errorlevel 1 exit /b 1
)

set "COMPOSE_LABEL="
docker inspect janus-postgres >nul 2>&1
if errorlevel 1 goto nolegacycontainer
for /f "usebackq delims=" %%L in (`docker inspect -f "{{ index .Config.Labels \"com.docker.compose.project\" }}" janus-postgres`) do set "COMPOSE_LABEL=%%L"
if "%COMPOSE_LABEL%"=="" (
  echo [start] Найден контейнер janus-postgres, созданный не через docker compose ^(старый ручной "docker run"^).
  echo [start] Удалите его один раз перед первым запуском: docker rm -f janus-postgres
  exit /b 1
)
:nolegacycontainer

echo [start] Поднимаю Postgres...
docker compose up -d --wait --wait-timeout 90 db
if errorlevel 1 (
  echo [start] Postgres не поднялся или не прошёл healthcheck.
  exit /b 1
)

echo [start] Применяю миграции...
call npx prisma migrate deploy
if errorlevel 1 exit /b 1

echo [start] Засеваю справочные данные...
call npm run prisma:seed
if errorlevel 1 exit /b 1

if /I "%MODE%"=="prod" (
  echo [start] Собираю production-бандл...
  call npm run build
  if errorlevel 1 exit /b 1
  echo [start] Запускаю production-сервер...
  call npm run start
) else (
  echo [start] Запускаю dev-сервер...
  call npm run dev
)
