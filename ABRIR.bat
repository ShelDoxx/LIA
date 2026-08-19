@echo off
title Lia
set "PATH=%USERPROFILE%\.local\nodejs;%PATH%"
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo No encuentro Node.js.
  echo Instala Node LTS o deja la copia en %USERPROFILE%\.local\nodejs
  pause
  exit /b 1
)

echo Abriendo Lia en http://localhost:5173
echo Deja esta ventana abierta mientras uses la app.
echo.
npm run dev
pause
