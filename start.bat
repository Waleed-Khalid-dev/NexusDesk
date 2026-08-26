@echo off
color 0a
title Crypto Hub Launcher

:MENU
cls
echo ====================================
echo        CRYPTO HUB LAUNCHER
echo ====================================
echo.
echo 1. Launch Desktop App (Electron)
echo 2. Launch Web Dashboard (Next.js)
echo 3. Exit
echo.

set /p choice="Select an option (1-3): "

if "%choice%"=="1" goto DESKTOP
if "%choice%"=="2" goto WEB
if "%choice%"=="3" goto EOF
goto MENU

:DESKTOP
cls
echo Starting Desktop App...
call npm run desktop
goto EOF

:WEB
cls
echo Starting Web Dashboard (Next.js server)...
echo Once it starts, open http://localhost:3000 in your browser.
call npm run dev
pause
goto EOF

:EOF
