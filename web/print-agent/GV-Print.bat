@echo off
title GV print agent
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0gv-print-agent.ps1"
pause
