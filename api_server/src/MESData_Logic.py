from sqlalchemy.orm import Session
from src.MESData_Structure import Metrics_Structure, WorkLog_Structure, WorkLogCreate_Structure

# ==========================================
# MES Data Logic Functions
# ==========================================
def get_recent_metrics(db: Session, limit: int = 100):
    """
    Query the most recent metrics (PLC/SPOT) data.
    Returns structurally defined Metrics_Structure objects.
    """
    return db.query(Metrics_Structure).order_by(Metrics_Structure.timestamp.desc()).limit(limit).all()

def get_recent_work_logs(db: Session, limit: int = 50):
    """
    Query the most recent work logs.
    Returns structurally defined WorkLog_Structure objects.
    """
    return db.query(WorkLog_Structure).order_by(WorkLog_Structure.start_time.desc()).limit(limit).all()

def create_work_log(db: Session, log_data: WorkLogCreate_Structure):
    """
    Creates a new work log entry in the database.
    Accepts Pydantic schema structure and transforms to SQLAlchemy structure.
    """
    new_log = WorkLog_Structure(**log_data.dict())
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log
