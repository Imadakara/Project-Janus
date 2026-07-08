@echo off
setlocal EnableExtensions

REM Usage: scripts\start.bat [dev|prod]   (default: dev)
REM Starts the environment (Postgres, migrations, seed) and the site in a separate
REM window. Press any key in THIS window to stop the site and the database.

set "APP_WINDOW_TITLE=PROJECT_JANUS_APP"

cd /d "%~dp0.."

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"
if /I not "%MODE%"=="dev" if /I not "%MODE%"=="prod" (
  echo Usage: scripts\start.bat [dev^|prod]
  exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [start] Docker not found in PATH. Install Docker Desktop and try again.
  exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo [start] Docker Compose v2 plugin not found ^(need "docker compose", not "docker-compose"^).
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 goto startdocker
goto dockerready

:startdocker
echo [start] Docker daemon is not reachable, trying to start Docker Desktop...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>nul | find /I "Docker Desktop.exe" >nul
if not errorlevel 1 goto waitdaemon
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  echo [start] Docker Desktop.exe not found. Start Docker manually and try again.
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
  echo [start] Docker daemon did not come up in time.
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto waitdaemonloop

:dockerready
if not exist ".env" (
  echo [start] .env not found, copying from .env.example
  copy /y ".env.example" ".env" >nul
)

if not exist "node_modules\" (
  echo [start] Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

set "COMPOSE_LABEL="
docker inspect janus-postgres >nul 2>&1
if errorlevel 1 goto nolegacycontainer
for /f "usebackq delims=" %%L in (`docker inspect -f "{{ index .Config.Labels \"com.docker.compose.project\" }}" janus-postgres`) do set "COMPOSE_LABEL=%%L"
if "%COMPOSE_LABEL%"=="" (
  echo [start] Found a janus-postgres container that wasn't created by docker compose ^(old manual "docker run"^).
  echo [start] Remove it once before the first run: docker rm -f janus-postgres
  exit /b 1
)
:nolegacycontainer

echo [start] Starting Postgres...
docker compose up -d --wait --wait-timeout 90 db
if errorlevel 1 (
  echo [start] Postgres did not come up or failed its healthcheck.
  exit /b 1
)

echo [start] Applying migrations...
call npx prisma migrate deploy
if errorlevel 1 exit /b 1

echo [start] Seeding reference data...
call npm run prisma:seed
if errorlevel 1 exit /b 1

netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 goto appalreadyrunning

if /I "%MODE%"=="prod" (
  echo [start] Building production bundle...
  call npm run build
  if errorlevel 1 exit /b 1
  echo [start] Starting production server in a separate window...
  start "%APP_WINDOW_TITLE%" cmd /k "title %APP_WINDOW_TITLE% & npm run start"
) else (
  echo [start] Starting dev server in a separate window...
  start "%APP_WINDOW_TITLE%" cmd /k "title %APP_WINDOW_TITLE% & npm run dev"
)
goto waitforstop

:appalreadyrunning
echo [start] Port 3000 is already in use - assuming the site is already running.

:waitforstop
echo.
echo [start] Site: http://localhost:3000
echo [start] Press any key in THIS window to stop the server and the database...
pause >nul

echo [start] Stopping server...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
taskkill /FI "WINDOWTITLE eq %APP_WINDOW_TITLE%" /T /F >nul 2>&1

echo [start] Stopping database...
docker compose stop

echo [start] Done.
