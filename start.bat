@echo off
setlocal

start "backend" cmd /k "cd /d "%~dp0backend" && npm install && npm run dev"
start "frontend" cmd /k "cd /d "%~dp0frontend" && npm install && npm run dev"

echo Application lancee.
echo Backend:  http://localhost:3001/health
echo Frontend: http://localhost:5173
