from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import os

from src.database import get_db, engine
from src.MESData_Structure import Base, WorkLogCreate_Structure
from src import MESData_Logic

# Initialize DB Tables (if not already managed by DBeaver/Alembic)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MES Data V2 API", description="Smart Factory Data Pipeline Backend using Structure/Logic pattern")

WATCH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ext_pipeline", "data_in"))
PROCESSED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ext_pipeline", "data_processed"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "MES Data V2 API Server is running"}

@app.get("/api/metrics")
def get_metrics(limit: int = 100, db: Session = Depends(get_db)):
    """Fetch recent extrusion metrics."""
    return MESData_Logic.get_recent_metrics(db, limit)

@app.get("/api/work_logs")
def get_work_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Fetch recent work logs."""
    return MESData_Logic.get_recent_work_logs(db, limit)

@app.post("/api/work_logs")
def create_work_log(log_data: WorkLogCreate_Structure, db: Session = Depends(get_db)):
    """Create a new work log from the frontend."""
    try:
        return {"status": "success", "data": MESData_Logic.create_work_log(db, log_data)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    """Return summarized stats for the dashboard."""
    return MESData_Logic.get_db_stats(db)

@app.get("/api/uploaded_files")
def get_uploaded_files(db: Session = Depends(get_db)):
    """Return a list of files that have already been processed to prevent duplicates, along with metadata."""
    return MESData_Logic.get_uploaded_files_metadata(db)

@app.get("/api/log/{filename}")
def get_file_log(filename: str):
    """Fetch the text log generated during parsing/insertion for a specific file."""
    return MESData_Logic.get_file_log_content(filename)

from fastapi import BackgroundTasks

@app.post("/api/upload")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Save the uploaded file to data_in and trigger background pipeline parsing."""
    return MESData_Logic.process_file_upload(file, background_tasks)

@app.delete("/api/uploaded_files/{filename}")
def delete_uploaded_file(filename: str, db: Session = Depends(get_db)):
    """Delete uploaded physical files and logically associated database records."""
    return MESData_Logic.delete_uploaded_file_data(filename, db)

