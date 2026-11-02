@echo off
title GV print agent
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org then double-click this file again.
  pause
  exit /b 1
)
node gv-print-agent.mjs
pause
