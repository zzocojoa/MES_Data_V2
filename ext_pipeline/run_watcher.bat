@echo off
echo Starting Data Collector Watcher...
cd /d "%~dp0"
call venv\Scripts\activate.bat
python watcher.py
pause
