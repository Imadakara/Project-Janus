@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

echo [stop] Останавливаю контейнеры ^(данные в томе сохраняются^)...
docker compose stop
