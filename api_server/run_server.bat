@echo off
echo Starting Backend API Server (FastAPI)...
cd /d "%~dp0"
if not exist "venv" (
    echo Python venv not found. Creating and installing requirements...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
