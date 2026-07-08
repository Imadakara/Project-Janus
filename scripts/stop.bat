@echo off
setlocal EnableExtensions

REM Fallback for when the start.bat window was closed without pressing a key
REM (e.g. clicked the X button) - kills the leftover site process, then stops the DB.

set "APP_WINDOW_TITLE=PROJECT_JANUS_APP"

cd /d "%~dp0.."

echo [stop] Stopping server ^(if running^)...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
taskkill /FI "WINDOWTITLE eq %APP_WINDOW_TITLE%" /T /F >nul 2>&1

echo [stop] Stopping containers ^(data in the volume is kept^)...
docker compose stop
