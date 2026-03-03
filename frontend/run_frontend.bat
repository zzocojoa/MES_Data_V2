@echo off
echo Starting Frontend Web Dashboard (Vite + React)...
cd /d "%~dp0"
if not exist "node_modules" (
    echo node_modules not found. Installing packages...
    npm install
)
npm run dev
pause
