from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from src.database import get_db, engine
from src.MESData_Structure import Base, WorkLogCreate_Structure
from src import MESData_Logic

# Initialize DB Tables (if not already managed by DBeaver/Alembic)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MES Data V2 API", description="Smart Factory Data Pipeline Backend using Structure/Logic pattern")

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

