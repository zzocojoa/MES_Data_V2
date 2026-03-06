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

def get_db_stats(db: Session):
    """
    Query summary statistics of the database for the dashboard.
    """
    from sqlalchemy import func, text
    import os
    from datetime import datetime, timezone
    
    # Use exact COUNT(*) for real-time accuracy (reflects deletes immediately)
    total_metrics = db.query(func.count(Metrics_Structure.id)).scalar() or 0
    total_logs = db.query(func.count(WorkLog_Structure.id)).scalar() or 0
    
    PROCESSED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ext_pipeline", "data_processed"))
    
    # Determine last_sync by finding the most recently modified .log file in processed directory
    last_sync = None
    todays_files = 0
    
    if os.path.exists(PROCESSED_DIR):
        log_files = [os.path.join(PROCESSED_DIR, f) for f in os.listdir(PROCESSED_DIR) if f.endswith(".log")]
        todays_files = len(log_files)
        
        if log_files:
            latest_file = max(log_files, key=os.path.getmtime)
            last_sync_ts = os.path.getmtime(latest_file)
            last_sync = datetime.fromtimestamp(last_sync_ts, tz=timezone.utc)
    
    # Calculate database size
    db_size = db.execute(text("SELECT pg_size_pretty(pg_database_size(current_database()));")).scalar() or "0 bytes"
    
    return {
        "total_records": total_metrics + total_logs,
        "last_sync": last_sync,
        "todays_files": todays_files,
        "storage_size": db_size
    }

import os
import subprocess
from filelock import FileLock # fallback if available, or just use thread lock
import threading

pipeline_lock = threading.Lock()
from datetime import datetime, timezone
from fastapi import HTTPException, UploadFile, BackgroundTasks

WATCH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ext_pipeline", "data_in"))
PROCESSED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ext_pipeline", "data_processed"))
ERROR_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ext_pipeline", "data_error"))

def get_uploaded_files_metadata(db: Session = None):
    if db is None:
        return []
        
    from sqlalchemy import text
    query = text("""
        SELECT source_file as filename, 'tb_metrics' as target_db, Count(*) as cnt
        FROM tb_metrics
        WHERE source_file IS NOT NULL AND source_file != ''
        GROUP BY source_file
        UNION ALL
        SELECT source_file as filename, 'tb_work_log' as target_db, Count(*) as cnt
        FROM tb_work_log
        WHERE source_file IS NOT NULL AND source_file != ''
        GROUP BY source_file
    """)
    try:
        result = db.execute(query).fetchall()
    except Exception:
        return []
        
    files_meta = []
    
    # Sort files by actual upload time (log file modification time)
    for row in result:
        filename = row[0]
        size_approx = (row[2] or 0) * 128
        
        # Determine upload time from log file mod time
        processed_log_path = os.path.join(PROCESSED_DIR, f"{filename}.log")
        error_log_path = os.path.join(ERROR_DIR, f"{filename}.log")
        
        upload_time = None
        if os.path.exists(processed_log_path):
            upload_time = os.path.getmtime(processed_log_path)
        elif os.path.exists(error_log_path):
            upload_time = os.path.getmtime(error_log_path)
            
        if upload_time:
            # Convert to UTC ISO format for frontend
            ts = datetime.fromtimestamp(upload_time, tz=timezone.utc).isoformat()
        else:
            ts = datetime.utcnow().isoformat() + 'Z'
            
        if ts and not ts.endswith('Z') and '+' not in ts:
            ts += 'Z'
            
        files_meta.append({
            "filename": filename,
            "target_db": row[1],
            "timestamp": ts,
            "size": size_approx,
            "_raw_time": upload_time or 0 # For sorting
        })
        
    # Sort by actual upload time descending
    files_meta.sort(key=lambda x: x["_raw_time"], reverse=True)
    for meta in files_meta:
        del meta["_raw_time"]
        
    return files_meta

def get_file_log_content(filename: str):
    processed_log_path = os.path.join(PROCESSED_DIR, f"{filename}.log")
    error_log_path = os.path.join(ERROR_DIR, f"{filename}.log")
    
    if os.path.exists(error_log_path):
        with open(error_log_path, "r", encoding="utf-8") as f:
            return {"status": "error", "log": f.read()}
    elif os.path.exists(processed_log_path):
        with open(processed_log_path, "r", encoding="utf-8") as f:
            return {"status": "success", "log": f.read()}
    else:
        return {"status": "not_found", "log": "No detailed execution log available for this file."}

def run_pipeline_for_file(file_path: str):
    """Execute pipeline processing in the ext_pipeline's own Python environment."""
    pipeline_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ext_pipeline"))
    main_script = os.path.join(pipeline_dir, "main.py")
    
    # Use the ext_pipeline's own venv Python (it has pandas, psycopg2)
    pipeline_python = os.path.join(pipeline_dir, "venv", "Scripts", "python.exe")
    if not os.path.exists(pipeline_python):
        pipeline_python = "python"  # Fallback to system Python
        
    try:
        with pipeline_lock:
            result = subprocess.run(
                [pipeline_python, main_script, file_path],
                cwd=pipeline_dir,
                capture_output=True,
                text=True,
                check=True
            )
            print(f"Pipeline OK: {result.stdout}")
    except subprocess.CalledProcessError as e:
        print(f"Pipeline Error for {file_path} (Exit: {e.returncode}):")
        if e.stderr: print(f"STDERR: {e.stderr}")
        if e.stdout: print(f"STDOUT: {e.stdout}")

def process_file_upload(file: UploadFile, background_tasks: BackgroundTasks = None):
    os.makedirs(WATCH_DIR, exist_ok=True)
    safe_filename = os.path.basename(file.filename)
    file_location = os.path.join(WATCH_DIR, safe_filename)
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())
        
    if background_tasks:
        background_tasks.add_task(run_pipeline_for_file, file_location)
        
    return {"status": "success", "info": f"file '{file.filename}' saved and processing started"}

def delete_uploaded_file_data(filename: str, db: Session):
    from sqlalchemy import text
    try:
        db.execute(text("DELETE FROM tb_work_log WHERE source_file = :filename"), {"filename": filename})
        db.execute(text("DELETE FROM tb_metrics WHERE source_file = :filename"), {"filename": filename})
        db.commit()
        
        # DB-Only policy: raw processed_file_path no longer exists, just remove its log
        processed_log_path = os.path.join(PROCESSED_DIR, f"{filename}.log")
        error_file_path = os.path.join(ERROR_DIR, filename)
        error_log_path = os.path.join(ERROR_DIR, f"{filename}.log")
        
        for path in [processed_log_path, error_file_path, error_log_path]:
            if os.path.exists(path):
                os.remove(path)
                
        return {"status": "success", "message": f"Successfully deleted {filename} and removed associated data."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
