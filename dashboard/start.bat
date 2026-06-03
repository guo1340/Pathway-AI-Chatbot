@echo off
cd /d "%~dp0"
title Pathway AI Dashboard

if not exist "node_modules" (
  echo Installing dependencies...
  npm install
  echo.
)

echo Starting Pathway Dashboard...
start "" "http://localhost:3131"
node server.js
pause
